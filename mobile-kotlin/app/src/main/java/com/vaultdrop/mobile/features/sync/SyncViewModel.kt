package com.vaultdrop.mobile.features.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
 */
@HiltViewModel
class SyncViewModel @Inject constructor(
    private val deviceSync: DeviceSync,
    private val folderRepository: FolderRepository,
) : ViewModel() {

    private var loopJob: Job? = null

    data class ImportState(
        val isImporting: Boolean = false,
        val error: String? = null,
    )

    private val _importState = MutableStateFlow(ImportState())
    val importState: StateFlow<ImportState> = _importState.asStateFlow()

    /** Démarre la boucle une seule fois (idempotent). */
    fun ensureStarted() {
        if (loopJob?.isActive == true) return
        loopJob = viewModelScope.launch {
            // Premier cycle différé : laisser le boot et le premier écran
            // répondre avant de lancer un walk potentiellement long.
            delay(FIRST_DELAY_MS)
            while (isActive) {
                runCatching { deviceSync.syncAll() }
                    .onSuccess { results ->
                        if (results.isNotEmpty()) Timber.d("syncAll: %s", results)
                    }
                    .onFailure { e -> Timber.w(e, "syncAll failed, retrying later") }
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
            }
        }
    }

    companion object {
        /** Cadence de la boucle — même valeur que `useSyncDevice(30_000)` Expo. */
        const val INTERVAL_MS = 30_000L
        /** Délai avant le premier cycle (au démarrage de l'app). */
        const val FIRST_DELAY_MS = 2_000L
    }
}