package com.vaultdrop.mobile.ui.document

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.orderedByReferenceDateDesc
import com.vaultdrop.mobile.data.repository.FileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Consultation de documents : expose la liste complète des fichiers (même tri
 * que l'accueil) pour naviguer au swipe d'un document à l'autre.
 */
@HiltViewModel
class DocumentViewerViewModel @Inject constructor(
    private val fileRepository: FileRepository,
) : ViewModel() {

    private val _documents = MutableStateFlow<List<FileEntity>>(emptyList())
    val documents: StateFlow<List<FileEntity>> = _documents.asStateFlow()

    init {
        viewModelScope.launch {
            fileRepository.observeAllVisible().collect { files ->
                _documents.value = files.orderedByReferenceDateDesc()
            }
        }
    }
}