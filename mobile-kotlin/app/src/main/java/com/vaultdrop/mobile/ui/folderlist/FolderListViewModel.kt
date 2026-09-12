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
import com.vaultdrop.mobile.features.saf.FileMover
import com.vaultdrop.mobile.features.saf.SafFolderCreator
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
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

    /** Dossier courant de l'explorateur Dossiers (null = racine par défaut). */
    private val _browseFolderId = MutableStateFlow<String?>(null)

    init {
        observeBrowse()
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
     * Sélectionne le layer affiché de la page Fichiers. Désactivé en
     * sélection/déplacement (ux : on ne change pas de vue dans ces modes).
     */
    fun selectView(view: HomeView) {
        _uiState.update { it.copy(view = view) }
    }

    /**
     * Explorateur Dossiers : sous-dossiers du dossier courant (`null` = racine
     * par défaut), réabonnés quand la racine ou la position change. Quand la
     * racine change (onboarding), on revient à la racine et on affiche son nom.
     */
    private fun observeBrowse() {
        viewModelScope.launch {
            _defaultRootId.collect { rootId ->
                _browseFolderId.value = null
                if (rootId == null) {
                    _uiState.update { it.copy(browseFolderId = null, browseFolderName = null) }
                } else {
                    val rootName = folderRepository.getFolder(rootId)?.name
                    _uiState.update { it.copy(browseFolderId = null, browseFolderName = rootName) }
                }
            }
        }
        viewModelScope.launch {
            _defaultRootId.combine(_browseFolderId) { root, browse -> browse ?: root }
                .flatMapLatest { parentId ->
                    if (parentId == null) flowOf(emptyList())
                    else folderRepository.observeSubFolders(parentId)
                }
                .collect { subFolders ->
                    _uiState.update { it.copy(browseSubFolders = subFolders) }
                }
        }
    }

    /** Descend dans l'explorateur Dossiers (aussi en mode déplacement). */
    fun openBrowseFolder(folderId: String) {
        _browseFolderId.value = folderId
        viewModelScope.launch {
            val folder = folderRepository.getFolder(folderId)
            _uiState.update { it.copy(browseFolderId = folderId, browseFolderName = folder?.name) }
        }
    }

    /** Remonte au parent du dossier courant (reste à la racine si déjà en haut). */
    fun browseUp() {
        val current = _browseFolderId.value
        viewModelScope.launch {
            val parent = current?.let { folderRepository.getFolder(it)?.parentResourceId }
            _browseFolderId.value = parent
            val name = parent?.let { folderRepository.getFolder(it)?.name }
            _uiState.update { it.copy(browseFolderId = parent, browseFolderName = name) }
        }
    }

    /**
     * Crée un dossier physique dans le dossier courant de l'explorateur (racine
     * par défaut si on est en haut) puis l'enregistre en Room comme son enfant.
     */
    fun createFolderInBrowse(name: String) {
        val trimmed = name.trim()
        if (trimmed.isBlank()) {
            _uiState.update { it.copy(createError = context.getString(R.string.new_folder_name_required)) }
            return
        }
        viewModelScope.launch {
            val targetId = _browseFolderId.value ?: _defaultRootId.value
            val target = targetId?.let { folderRepository.getFolder(it) }
            if (target == null) {
                _uiState.update { it.copy(createError = context.getString(R.string.new_folder_error)) }
                return@launch
            }
            val message = if (target.uri == null) {
                context.getString(R.string.new_folder_cloud_only)
            } else {
                context.getString(R.string.new_folder_error)
            }
            val created = safFolderCreator.createFolder(target.uri, trimmed)
            if (created == null) {
                _uiState.update { it.copy(createError = message) }
                return@launch
            }
            folderRepository.saveFolder(
                input = SaveFolderInput(uri = created.toString(), name = trimmed, exists = true, createdInApp = true),
                parentResourceId = target.resourceId,
            )
        }
    }

    /** Consomme une erreur transitoire de création (Snackbar). */
    fun clearCreateError() {
        _uiState.update { it.copy(createError = null) }
    }

    /**
     * Entre en mode déplacement : vue Dossiers forcée, explorateur ramené à la
     * racine pour un choix de destination prévisible.
     */
    fun startMove() {
        _browseFolderId.value = null
        viewModelScope.launch {
            val rootName = _defaultRootId.value?.let { folderRepository.getFolder(it)?.name }
            _uiState.update {
                it.copy(
                    viewBeforeMove = it.view,
                    view = HomeView.FOLDERS,
                    moveMode = true,
                    browseFolderId = null,
                    browseFolderName = rootName,
                )
            }
        }
    }

    /** Annule le mode déplacement : restaure la vue, la sélection est conservée. */
    fun cancelMove() {
        val previous = _uiState.value.viewBeforeMove ?: HomeView.DASHBOARD
        _uiState.update {
            it.copy(
                moveMode = false,
                view = previous,
                viewBeforeMove = null,
            )
        }
    }

    /**
     * Déplace la sélection dans le dossier courant de l'explorateur (la racine
     * par défaut si on est en haut) puis sort du mode déplacement.
     */
    fun moveSelectionHere(resourceIds: List<String>) {
        viewModelScope.launch {
            val target = _browseFolderId.value ?: _defaultRootId.value
            if (target == null || runCatching { fileMover.moveFiles(resourceIds, target) }.isFailure) {
                _uiState.update { it.copy(moveError = context.getString(R.string.move_files_error)) }
            } else {
                _uiState.update { it.copy(moveSuccess = true) }
            }
            val previous = _uiState.value.viewBeforeMove ?: HomeView.DASHBOARD
            _uiState.update {
                it.copy(moveMode = false, view = previous, viewBeforeMove = null)
            }
        }
    }

    /** Consomme le succès transitoire de déplacement (Snackbar). */
    fun clearMoveSuccess() {
        _uiState.update { it.copy(moveSuccess = false) }
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