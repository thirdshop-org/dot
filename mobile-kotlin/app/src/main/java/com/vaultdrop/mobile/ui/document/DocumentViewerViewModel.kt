package com.vaultdrop.mobile.ui.document

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.local.orderedByReferenceDateDesc
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.features.saf.FileDeleter
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Consultation de documents : expose la liste complète des fichiers (même tri
 * que l'accueil) pour naviguer au swipe d'un document à l'autre.
 *
 * Porte aussi les actions du document affiché : garder un fichier de la review
 * (`processed = false`) ou le supprimer selon les trois modes [FileDeleter.DeleteMode].
 */
@HiltViewModel
class DocumentViewerViewModel @Inject constructor(
    private val fileRepository: FileRepository,
    private val fileDeleter: FileDeleter,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    data class ViewerUiState(
        /** Une action (garder / supprimer) est en cours — désactive les boutons. */
        val busy: Boolean = false,
        /** Erreur transitoire de suppression — affichée en Snackbar puis effacée. */
        val deleteError: String? = null,
        /** Succès transitoire « gardé » — affiché en Snackbar puis effacé. */
        val keepMessage: String? = null,
    )

    private val _documents = MutableStateFlow<List<FileEntity>>(emptyList())
    val documents: StateFlow<List<FileEntity>> = _documents.asStateFlow()

    private val _uiState = MutableStateFlow(ViewerUiState())
    val uiState: StateFlow<ViewerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            fileRepository.observeAllVisible().collect { files ->
                _documents.value = files.orderedByReferenceDateDesc()
            }
        }
    }

    /** Garder un document en attente de review : il est marqué traité et poussé. */
    fun keep(file: FileEntity) {
        _uiState.update { it.copy(busy = true) }
        viewModelScope.launch {
            runCatching { fileRepository.markProcessed(file.resourceId) }
                .onSuccess {
                    _uiState.update { it.copy(keepMessage = context.getString(R.string.document_keep_done)) }
                }
                .onFailure {
                    Timber.w(it, "document: mark processed failed for %s", file.resourceId)
                    _uiState.update { it.copy(deleteError = context.getString(R.string.document_keep_error)) }
                }
            _uiState.update { it.copy(busy = false) }
        }
    }

    /** Supprime le document selon le mode choisi (local, cloud, ou les deux). */
    fun delete(file: FileEntity, mode: FileDeleter.DeleteMode) {
        _uiState.update { it.copy(busy = true) }
        viewModelScope.launch {
            val report = fileDeleter.deleteFiles(listOf(file), mode)
            if (report.failed > 0) {
                _uiState.update { it.copy(deleteError = context.getString(R.string.delete_error)) }
            }
            _uiState.update { it.copy(busy = false) }
        }
    }

    fun clearDeleteError() {
        _uiState.update { it.copy(deleteError = null) }
    }

    fun clearKeepMessage() {
        _uiState.update { it.copy(keepMessage = null) }
    }
}

/**
 * Modes de suppression possibles pour un fichier, selon son placement.
 *
 * - `local` : pas de copie cloud → seul un delete physique a un sens.
 * - `cloud` (uri null) : fichier cloud-only → seul le delete outbox a un sens.
 * - `local-cloud` : les trois modes sont possibles (local, cloud, les deux).
 */
fun deleteModesFor(file: FileEntity): List<FileDeleter.DeleteMode> = when (file.syncStatus) {
    FileStatus.LOCAL -> listOf(FileDeleter.DeleteMode.LOCALLY)
    FileStatus.CLOUD -> listOf(FileDeleter.DeleteMode.IN_CLOUD)
    FileStatus.LOCAL_CLOUD -> listOf(
        FileDeleter.DeleteMode.LOCALLY,
        FileDeleter.DeleteMode.IN_CLOUD,
        FileDeleter.DeleteMode.FULL,
    )
    else -> emptyList()
}