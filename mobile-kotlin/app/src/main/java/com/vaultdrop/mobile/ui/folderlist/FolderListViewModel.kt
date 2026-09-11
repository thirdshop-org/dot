package com.vaultdrop.mobile.ui.folderlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.repository.FolderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class FolderListViewModel @Inject constructor(
    private val folderRepository: FolderRepository,
    private val tokenProvider: TokenProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FolderListUiState())
    val uiState: StateFlow<FolderListUiState> = _uiState.asStateFlow()

    init {
        observeFolders()
        refresh()
    }

    private fun observeFolders() {
        viewModelScope.launch {
            folderRepository.observeRootFolders().collect { folders ->
                _uiState.update { it.copy(folders = folders) }
            }
        }
    }

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