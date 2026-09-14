package com.vaultdrop.mobile.features.sync

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.vaultdrop.mobile.data.local.dao.PendingOperationDao
import com.vaultdrop.mobile.data.local.entity.PendingOpStatus
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import com.vaultdrop.mobile.data.repository.ShareRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Boucle de fond : explore périodiquement toutes les racines SAF via
 * [DeviceSync.syncAll] — miroir de `useSyncDevice(30_000)` côté Expo.
 *
 * Garanties :
 *  - l'exploration est sur `Dispatchers.IO` et sérialisée par le Mutex de
 *    [DeviceSync] : jamais deux walks en parallèle, jamais de blocage UI ;
 *  - un échec n'interrompt pas la boucle (retry au tick suivant) ;
 *  - le scope du ViewModel arrête la boucle (cancel) à la destruction du
 *    store → le walk en cours s'arrête via `ensureActive()` du scanner.
 *
 * **Observabilité** : expose [syncStatus] pour le badge du header — marche SAF
 * en cours ([SyncStatus.syncing]), nombre d'ops outbox en attente, et les
 * dernières opérations ([SyncStatus.operations]) pour la « liste des sync ».
 */
@HiltViewModel
class SyncViewModel @Inject constructor(
    private val deviceSync: DeviceSync,
    private val folderRepository: FolderRepository,
    private val pendingOperationDao: PendingOperationDao,
    private val shareRepository: ShareRepository,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    private var loopJob: Job? = null

    data class ImportState(
        val isImporting: Boolean = false,
        val error: String? = null,
    )

    /** État de la synchro affiché dans le header (indicateur + liste). */
    data class SyncStatus(
        /** Une marche SAF ou un drain outbox est en cours. */
        val syncing: Boolean = false,
        /** Ops en attente de push (jamais poussées, outbox non vide). */
        val pending: Int = 0,
        /** Ops dead-lettrées (dernières seulement, vu la fenêtre UI). */
        val failed: Int = 0,
        /** Dernières opérations (tous statuts) — « liste des sync ». */
        val operations: List<PendingOperationEntity> = emptyList(),
    )

    private val _importState = MutableStateFlow(ImportState())
    val importState: StateFlow<ImportState> = _importState.asStateFlow()

    private val _walkInProgress = MutableStateFlow(false)

    /** Activity de synthèse : marche SAF + drain outbox + file + dernière ops. */
    val syncStatus: StateFlow<SyncStatus> = combine(
        _walkInProgress,
        WorkManager.getInstance(appContext).getWorkInfosForUniqueWorkFlow(OutboxSyncWorker.NAME),
        pendingOperationDao.observePendingCount(),
        pendingOperationDao.observeRecent(RECENT_LIMIT),
    ) { walking, workInfos, pending, operations ->
        // RUNNING = drain en cours ; ENQUEUED = planifié (attente réseau/backoff).
        val draining = workInfos.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED }
        SyncStatus(
            syncing = walking || draining,
            pending = pending,
            failed = operations.count { it.status == PendingOpStatus.FAILED },
            operations = operations,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SyncStatus())

    /** Démarre la boucle une seule fois (idempotent). */
    fun ensureStarted() {
        if (loopJob?.isActive == true) return
        loopJob = viewModelScope.launch {
            // Premier cycle différé : laisser le boot et le premier écran
            // répondre avant de lancer un walk potentiellement long.
            delay(FIRST_DELAY_MS)
            while (isActive) {
                _walkInProgress.value = true
                runCatching { deviceSync.syncAll() }
                    .onSuccess { results ->
                        if (results.isNotEmpty()) Timber.d("syncAll: %s", results)
                        // Les nouvelles ressources découvertes sont dans l'outbox
                        // → drainer vers POST /sync/ops (single-flight via KEEP).
                        OutboxSyncWorker.enqueue(appContext)
                    }
                    .onFailure { e -> Timber.w(e, "syncAll failed, retrying later") }
                // Hydrate les ressources partagées depuis le snapshot serveur.
                // Échec réseau toléré : le prochain tick réessaiera.
                runCatching { shareRepository.syncSnapshot() }
                    .onFailure { e -> Timber.d("syncSnapshot failed, retrying later: %s", e.message) }
                _walkInProgress.value = false
                delay(INTERVAL_MS)
            }
        }
    }

    /**
     * Import volontaire d'un dossier SAF (ajout + marche récursive).
     *
     * Scope Activity (VaultDropApp) : survit aux changements d'onglets — un
     * walk lancé ici n'est pas annulé quand l'utilisateur quitte l'écran
     * Fichiers, et `importState` continue d'être visible partout.
     *
     * Single-flight : tant qu'un import tourne (ou attend le mutex de
     * [DeviceSync]), les appels suivants sont ignorés.
     */
    fun importRoot(uri: String, name: String) {
        if (_importState.value.isImporting) return
        viewModelScope.launch {
            _importState.value = ImportState(isImporting = true)
            _walkInProgress.value = true
            try {
                val saved = folderRepository.saveFolder(
                    SaveFolderInput(uri = uri, name = name, exists = true),
                )
                val result = deviceSync.syncRoot(saved.resourceId)
                Timber.d("syncRoot %s", result)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.w(e, "syncRoot failed")
                _importState.value = ImportState(error = e.message ?: "Erreur lors de l'ajout du dossier")
            } finally {
                _importState.value = _importState.value.copy(isImporting = false)
                _walkInProgress.value = false
            }
        }
    }

    /** Id Room d'une racine SAF à partir de son uri (après un `importRoot`). */
    suspend fun rootResourceId(uri: String): String? =
        folderRepository.getByUri(uri)?.resourceId

    companion object {
        /** Cadence de la boucle — même valeur que `useSyncDevice(30_000)` Expo. */
        const val INTERVAL_MS = 30_000L
        /** Délai avant le premier cycle (au démarrage de l'app). */
        const val FIRST_DELAY_MS = 2_000L
        /** Fenêtre d'affichage de la « liste des sync ». */
        const val RECENT_LIMIT = 50
    }
}