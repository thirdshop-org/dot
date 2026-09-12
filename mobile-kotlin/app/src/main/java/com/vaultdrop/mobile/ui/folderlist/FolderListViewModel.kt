package com.vaultdrop.mobile.ui.folderlist

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.local.referenceDate
import com.vaultdrop.mobile.data.preferences.DefaultRootStore
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import com.vaultdrop.mobile.features.saf.FileMover
import com.vaultdrop.mobile.features.saf.SafFolderCreator
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
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
    private val safFolderCreator: SafFolderCreator,
    private val fileMover: FileMover,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FolderListUiState())
    val uiState: StateFlow<FolderListUiState> = _uiState.asStateFlow()

    /** Racine VaultDrop obligatoire : null = premier lancement (onboarding). */
    private val _defaultRootId = MutableStateFlow(defaultRootStore.get())
    val defaultRootId: StateFlow<String?> = _defaultRootId.asStateFlow()

    private var subFolderJob: Job? = null

    init {
        observeSubFolders()
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
            input = SaveFolderInput(
                uri = vaultFolderUri.toString(),
                name = label,
                exists = true,
                createdInApp = true,
            ),
            parentResourceId = rootRoomId,
        )
        return saved.resourceId
    }

    /**
     * Sous-dossiers visibles de la racine par défaut, ré-abonnés quand la
     * racine change (onboarding). Un dossier créé y apparaît immédiatement.
     */
    private fun observeSubFolders() {
        viewModelScope.launch {
            _defaultRootId.collect { rootId ->
                subFolderJob?.cancel()
                if (rootId == null) {
                    _uiState.update { it.copy(subFolders = emptyList()) }
                    return@collect
                }
                subFolderJob = viewModelScope.launch {
                    folderRepository.observeSubFolders(rootId).collect { subFolders ->
                        _uiState.update { it.copy(subFolders = subFolders) }
                    }
                }
            }
        }
    }

    /**
     * Crée un dossier physique dans la racine par défaut (VaultDrop) puis
     * l'enregistre en Room comme enfant de la racine.
     */
    fun createFolderInDefaultRoot(name: String) {
        val trimmed = name.trim()
        if (trimmed.isBlank()) {
            _uiState.update { it.copy(createError = context.getString(R.string.new_folder_name_required)) }
            return
        }
        viewModelScope.launch {
            val rootId = _defaultRootId.value
            val root = rootId?.let { folderRepository.getFolder(it) }
            if (root == null) {
                _uiState.update { it.copy(createError = context.getString(R.string.new_folder_error)) }
                return@launch
            }
            val message = if (root.uri == null) {
                context.getString(R.string.new_folder_cloud_only)
            } else {
                context.getString(R.string.new_folder_error)
            }
            val created = safFolderCreator.createFolder(root.uri, trimmed)
            if (created == null) {
                _uiState.update { it.copy(createError = message) }
                return@launch
            }
            folderRepository.saveFolder(
                input = SaveFolderInput(uri = created.toString(), name = trimmed, exists = true, createdInApp = true),
                parentResourceId = root.resourceId,
            )
        }
    }

    /** Consomme une erreur transitoire de création (Snackbar). */
    fun clearCreateError() {
        _uiState.update { it.copy(createError = null) }
    }

    /** Charge les dossiers éligibles pour le picker de déplacement. */
    fun loadMoveFolders() {
        viewModelScope.launch {
            val moveFolders = folderRepository.getCreatedInApp()
            _uiState.update { it.copy(moveFolders = moveFolders) }
        }
    }

    /** Déplace les fichiers vers le dossier cible puis ferme le picker. */
    fun moveSelectedFiles(resourceIds: List<String>, targetFolderId: String) {
        viewModelScope.launch {
            runCatching { fileMover.moveFiles(resourceIds, targetFolderId) }
                .onFailure {
                    _uiState.update { state ->
                        state.copy(moveError = context.getString(R.string.move_files_error))
                    }
                }
            _uiState.update { it.copy(moveFolders = null) }
        }
    }

    /** Ferme le picker sans déplacer (annulation). */
    fun closeMovePicker() {
        _uiState.update { it.copy(moveFolders = null) }
    }

    fun clearMoveError() {
        _uiState.update { it.copy(moveError = null) }
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