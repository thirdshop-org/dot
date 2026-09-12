package com.vaultdrop.mobile.ui.folderlist

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.referenceDate
import com.vaultdrop.mobile.data.preferences.DefaultRootStore
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.io.FileNotFoundException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class FolderListViewModel @Inject constructor(
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val tokenProvider: TokenProvider,
    private val defaultRootStore: DefaultRootStore,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FolderListUiState())
    val uiState: StateFlow<FolderListUiState> = _uiState.asStateFlow()

    /** Racine VaultDrop obligatoire : null = premier lancement (onboarding). */
    private val _defaultRootId = MutableStateFlow(defaultRootStore.get())
    val defaultRootId: StateFlow<String?> = _defaultRootId.asStateFlow()

    init {
        observeFiles()
        refresh()
    }

    /** Enregistre la racine choisie au premier lancement (persistant). */
    fun setDefaultRoot(resourceId: String) {
        defaultRootStore.set(resourceId)
        _defaultRootId.value = resourceId
    }

    /**
     * Crée (ou retrouve) un sous-dossier « VaultDrop » dans l'arbre choisi et
     * l'enregistre en Room comme enfant de la racine. Retourne son id — c'est
     * lui qui devient la racine par défaut où les PDF sont écrits.
     */
    suspend fun ensureVaultDropFolder(rootUri: Uri, rootRoomId: String): String? {
        val resolver = context.contentResolver
        val treeDocId = DocumentsContract.getTreeDocumentId(rootUri)
        val label = context.getString(R.string.default_root_folder_label)
        val parentUri = if (DocumentsContract.isTreeUri(rootUri)) {
            DocumentsContract.buildDocumentUriUsingTree(rootUri, treeDocId)
        } else {
            rootUri
        }
        val vaultFolderUri = runCatching {
            DocumentsContract.createDocument(
                resolver,
                parentUri,
                DocumentsContract.Document.MIME_TYPE_DIR,
                label,
            )
        }.getOrElse { e ->
            if (e is FileNotFoundException) {
                DocumentsContract.buildDocumentUriUsingTree(rootUri, "$treeDocId/$label")
            } else {
                Timber.w(e, "cannot create VaultDrop folder")
                null
            }
        } ?: return null

        val saved = folderRepository.saveFolder(
            input = SaveFolderInput(uri = vaultFolderUri.toString(), name = label, exists = true),
            parentResourceId = rootRoomId,
        )
        return saved.resourceId
    }

    /** Grille d'accueil : tous les fichiers visibles, groupés par jour (date de référence). */
    private fun observeFiles() {
        viewModelScope.launch {
            fileRepository.observeAllVisible().collect { files ->
                _uiState.update { it.copy(sections = groupFilesByDay(files)) }
            }
        }
    }

    /** Sections triées du plus récent au plus vieux, fichiers d'un jour triés par date
     *  décroissante, en paires. La date de référence = modification SAF, sinon ajout. */
    private fun groupFilesByDay(files: List<FileEntity>): List<FileSection> {
        val zone = ZoneId.systemDefault()
        return files
            .groupBy { startOfDay(it.referenceDate, zone) }
            .entries
            .sortedByDescending { it.key }
            .map { (day, list) ->
                val rows = list.sortedByDescending { it.referenceDate }
                    .chunked(2)
                    .map { pair ->
                        FilePair(
                            key = pair.joinToString { it.resourceId },
                            left = pair[0],
                            right = pair.getOrNull(1),
                        )
                    }
                FileSection(dayKey = day, dayLabel = formatDayLabel(day, zone), rows = rows)
            }
    }

    private fun startOfDay(millis: Long, zone: ZoneId): Long =
        Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
            .atStartOfDay(zone).toInstant().toEpochMilli()

    private fun formatDayLabel(millis: Long, zone: ZoneId): String =
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
            .withLocale(Locale.getDefault())
            .format(Instant.ofEpochMilli(millis).atZone(zone).toLocalDate())

    fun refresh() {
        viewModelScope.launch {
            // Sans token → mode local : on ne tient pas de GET /files/folders.
            if (tokenProvider.current == null) {
                Timber.d("folders: pas de token, rafraîchissement serveur ignoré")
                return@launch
            }
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            runCatching { folderRepository.refreshFromServer() }
                .onFailure { e ->
                    val error = when {
                        e is ApiException && e.code == "UNAUTHORIZED" -> "AUTH_REQUIRED"
                        else -> e.message ?: "Erreur réseau"
                    }
                    _uiState.update { it.copy(error = error) }
                }
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }
}