package com.vaultdrop.mobile.ui.folderdetail

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import com.vaultdrop.mobile.features.saf.FileDeleter
import com.vaultdrop.mobile.features.saf.FileMover
import com.vaultdrop.mobile.features.saf.SafFolderCreator
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FolderDetailUiState(
    val folder: FolderEntity? = null,
    val folderMissing: Boolean = false,
    val subFolders: List<FolderEntity> = emptyList(),
    val files: List<FileEntity> = emptyList(),
    val isRefreshing: Boolean = false,
    val error: String? = null,
    /** Erreur transitoire de création — affichée en Snackbar puis effacée. */
    val createError: String? = null,
    /** Dossiers disponibles pour le picker de déplacement (null = pas chargé). */
    val moveFolders: List<FolderEntity>? = null,
    /** Erreur transitoire de déplacement — affichée en Snackbar puis effacée. */
    val moveError: String? = null,
    /** Erreur transitoire de suppression — affichée en Snackbar puis effacée. */
    val deleteError: String? = null,
    /** Succès transitoire de suppression — affiché en Snackbar puis effacé. */
    val deleteSuccess: Boolean = false,
)

@HiltViewModel
class FolderDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val tokenProvider: TokenProvider,
    private val safFolderCreator: SafFolderCreator,
    private val fileMover: FileMover,
    private val fileDeleter: FileDeleter,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val folderResourceId: String =
        checkNotNull(savedStateHandle["folderResourceId"])

    private val _uiState = MutableStateFlow(FolderDetailUiState())
    val uiState: StateFlow<FolderDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val folder = folderRepository.getFolder(folderResourceId)
            if (folder == null) {
                // Écran orphelin (dossier supprimé/réconcilié) → le composable
                // navigate en arrière.
                _uiState.value = _uiState.value.copy(folderMissing = true)
                return@launch
            }
            _uiState.value = _uiState.value.copy(folder = folder)
        }

        viewModelScope.launch {
            folderRepository.observeSubFolders(folderResourceId).collect { subFolders ->
                _uiState.update { it.copy(subFolders = subFolders) }
            }
        }

        viewModelScope.launch {
            fileRepository.observeFiles(folderResourceId).collect { files ->
                _uiState.update { it.copy(files = files) }
            }
        }

        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            // Sans token → mode local : les fichiers n'existent que localement.
            if (tokenProvider.current == null) return@launch
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            runCatching { fileRepository.refreshFromServer(folderResourceId) }
                .onFailure { e ->
                    _uiState.update { it.copy(error = e.message ?: "Erreur réseau") }
                }
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    /**
     * Crée un sous-dossier physique dans le dossier courant puis l'enregistre
     * en Room. Impossible si le dossier parent est cloud-only (pas d'uri SAF).
     */
    fun createFolder(name: String) {
        val trimmed = name.trim()
        if (trimmed.isBlank()) {
            _uiState.update {
                it.copy(createError = context.getString(R.string.new_folder_name_required))
            }
            return
        }
        viewModelScope.launch {
            val folder = _uiState.value.folder
                ?: run {
                    _uiState.update { it.copy(createError = context.getString(R.string.new_folder_error)) }
                    return@launch
                }
            val physical = folder.uri != null
            val created = safFolderCreator.createFolder(folder.uri, trimmed)
            if (created == null) {
                val message = if (physical) {
                    context.getString(R.string.new_folder_error)
                } else {
                    context.getString(R.string.new_folder_cloud_only)
                }
                _uiState.update { it.copy(createError = message) }
                return@launch
            }
            folderRepository.saveFolder(
                input = SaveFolderInput(uri = created.toString(), name = trimmed, exists = true, createdInApp = true),
                parentResourceId = folder.resourceId,
            )
        }
    }

    /** Consomme une erreur transitoire de création (Snackbar). */
    fun clearCreateError() {
        _uiState.update { it.copy(createError = null) }
    }

    /** Charge les dossiers éligibles à recevoir les fichiers sélectionnés. */
    fun loadMoveFolders() {
        viewModelScope.launch {
            val all = folderRepository.getCreatedInApp()
            val exclude = folderResourceId
            _uiState.update { it.copy(moveFolders = all.filter { f -> f.resourceId != exclude }) }
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

    /** Supprime les fichiers sélectionnés selon le mode choisi. */
    fun deleteSelectedFiles(resourceIds: List<String>, mode: FileDeleter.DeleteMode) {
        viewModelScope.launch {
            val files = resourceIds.mapNotNull { fileRepository.getFile(it) }
            if (files.isEmpty()) {
                _uiState.update { it.copy(deleteError = context.getString(R.string.delete_error)) }
                return@launch
            }
            val report = fileDeleter.deleteFiles(files, mode)
            if (report.failed > 0) {
                _uiState.update { it.copy(deleteError = context.getString(R.string.delete_error)) }
            } else {
                _uiState.update { it.copy(deleteSuccess = true) }
            }
        }
    }

    fun clearDeleteError() {
        _uiState.update { it.copy(deleteError = null) }
    }

    fun clearDeleteSuccess() {
        _uiState.update { it.copy(deleteSuccess = false) }
    }
}