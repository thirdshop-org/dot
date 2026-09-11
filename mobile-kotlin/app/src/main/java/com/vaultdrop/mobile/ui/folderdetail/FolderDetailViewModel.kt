package com.vaultdrop.mobile.ui.folderdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
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
)

@HiltViewModel
class FolderDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val tokenProvider: TokenProvider,
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
}