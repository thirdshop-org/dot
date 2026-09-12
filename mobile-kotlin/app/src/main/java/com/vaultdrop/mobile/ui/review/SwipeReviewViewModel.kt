package com.vaultdrop.mobile.ui.review

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.features.saf.SafFileDeleter
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
 * File de review « traiter » : les fichiers locaux non encore traités.
 *
 * Le deck est chargé à l'ouverture de l'écran. `garder` marque le fichier
 * traité (flag local, jamais poussé) ; `supprimer` le supprime physiquement
 * du device (SAF). Les deux retirent la carte du deck de façon optimiste ;
 * en cas d'échec de suppression, le fichier est réinséré en tête.
 */
@HiltViewModel
class SwipeReviewViewModel @Inject constructor(
    private val fileRepository: FileRepository,
    private val safFileDeleter: SafFileDeleter,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    data class ReviewUiState(
        val isLoading: Boolean = false,
        val cards: List<FileEntity> = emptyList(),
        val total: Int = 0,
        val error: String? = null,
    ) {
        val remaining: Int get() = cards.size
        val isFinished: Boolean get() = !isLoading && cards.isEmpty()
    }

    private val _uiState = MutableStateFlow(ReviewUiState())
    val uiState: StateFlow<ReviewUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val files = runCatching { fileRepository.getUnprocessed() }
                .getOrElse { e ->
                    Timber.w(e, "review: cannot load unprocessed files")
                    _uiState.update {
                        it.copy(error = context.getString(R.string.review_load_error))
                    }
                    emptyList()
                }
            _uiState.update { it.copy(isLoading = false, cards = files, total = files.size) }
        }
    }

    /** Swipe droite (ou bouton ✓) : garder le document, le voilà traité. */
    fun keep(file: FileEntity) {
        viewModelScope.launch {
            runCatching { fileRepository.markProcessed(file.resourceId) }
                .onFailure { Timber.w(it, "review: mark processed failed for %s", file.resourceId) }
            removeOptimistically(file.resourceId)
        }
    }

    /** Swipe gauche (ou bouton ✗) : suppression physique du device. */
    fun delete(file: FileEntity) {
        viewModelScope.launch {
            removeOptimistically(file.resourceId)
            val deleted = runCatching { safFileDeleter.delete(file) }.getOrDefault(false)
            if (!deleted) {
                Timber.w("review: delete failed for %s — card kept", file.resourceId)
                _uiState.update {
                    it.copy(
                        error = context.getString(R.string.review_delete_error),
                        cards = listOf(file) + it.cards.filterNot { c -> c.resourceId == file.resourceId },
                    )
                }
            }
        }
    }

    /** Échappatoire : tout marquer traité d'un coup (premier lancement massif). */
    fun markAllProcessed() {
        viewModelScope.launch {
            runCatching { fileRepository.markAllProcessed() }
                .onFailure { Timber.w(it, "review: mark all failed") }
            _uiState.update { it.copy(cards = emptyList()) }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    private fun removeOptimistically(resourceId: String) {
        _uiState.update { it.copy(cards = it.cards.filterNot { c -> c.resourceId == resourceId }) }
    }
}