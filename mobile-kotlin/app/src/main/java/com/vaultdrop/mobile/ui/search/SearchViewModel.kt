package com.vaultdrop.mobile.ui.search

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.features.saf.FileMover
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val fileRepository: FileRepository,
    private val folderRepository: FolderRepository,
    private val fileMover: FileMover,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    private val _selectedCategory = MutableStateFlow<String?>(null)

    private val _moveFolders = MutableStateFlow<List<FolderEntity>?>(null)
    val moveFolders: StateFlow<List<FolderEntity>?> = _moveFolders.asStateFlow()

    private val _moveError = MutableStateFlow<String?>(null)
    val moveError: StateFlow<String?> = _moveError.asStateFlow()

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val uiState: StateFlow<SearchUiState> = combine(
        _searchQuery.debounce(SEARCH_DEBOUNCE_MS),
        _selectedCategory,
    ) { query, category -> CategoryQuery(query, category) }
        .flatMapLatest { (query, category) ->
            val trimmed = query.trim()
            val flow = if (trimmed.isEmpty()) {
                fileRepository.recentFiles(category)
            } else {
                fileRepository.searchFiles(trimmed, category)
            }
            flow.map { files -> SearchUiState(query, category, files) }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            initialValue = SearchUiState(),
        )

    fun onQueryChange(query: String) {
        _searchQuery.value = query
    }

    fun onCategorySelect(category: String?) {
        _selectedCategory.value = category
    }

    fun loadMoveFolders() {
        viewModelScope.launch {
            _moveFolders.value = folderRepository.getCreatedInApp()
        }
    }

    /** Déplace les fichiers vers le dossier cible puis ferme le picker. */
    fun moveSelectedFiles(resourceIds: List<String>, targetFolderId: String) {
        viewModelScope.launch {
            runCatching { fileMover.moveFiles(resourceIds, targetFolderId) }
                .onFailure {
                    _moveError.update { context.getString(R.string.move_files_error) }
                }
            _moveFolders.value = null
        }
    }

    fun closeMovePicker() {
        _moveFolders.value = null
    }

    fun clearMoveError() {
        _moveError.value = null
    }

    private data class CategoryQuery(val query: String, val category: String?)

    companion object {
        private const val SEARCH_DEBOUNCE_MS = 300L
        private const val STOP_TIMEOUT_MS = 5_000L
    }
}

data class SearchUiState(
    val query: String = "",
    val selectedCategory: String? = null,
    val results: List<FileEntity> = emptyList(),
)