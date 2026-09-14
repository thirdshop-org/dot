package com.vaultdrop.mobile.ui.share

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.repository.OutboxRepository
import com.vaultdrop.mobile.features.sync.OutboxSyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class ShareUiState(
    val sharing: Boolean = false,
    /** Code d'erreur contractuel (`USER_NOT_FOUND`, `SHARE_FAILED`) ou null. */
    val error: String? = null,
    /** L'op `share` a été enqueued avec succès (prête pour le drain). */
    val enqueued: Boolean = false,
)

/** Accès partage — valeur du payload `access` (docs/api-v1.md §6.1). */
object ShareAccessLevel {
    const val VIEWER = "viewer"
    const val COMMENTER = "commenter"
    const val EDITOR = "editor"
}

/**
 * Partage d'une ressource locale avec un autre utilisateur : résout le
 * destinataire par username (exact), puis enqueue l'op `share` dans l'outbox
 * (drainée par [OutboxSyncWorker]).
 */
@HiltViewModel
class ShareViewModel @Inject constructor(
    private val apiClient: ApiClient,
    private val outboxRepository: OutboxRepository,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ShareUiState())
    val uiState: StateFlow<ShareUiState> = _uiState.asStateFlow()

    /**
     * Partage [resourceId] avec l'utilisateur [username] au niveau [access].
     *
     * 1. `GET /users/resolve` (username exact) → user id ;
     * 2. enqueue `share` dans l'outbox ;
     * 3. déclenche le drain du worker.
     */
    fun share(resourceId: String, resourceType: String, username: String, access: String) {
        if (_uiState.value.sharing) return
        viewModelScope.launch {
            _uiState.update { it.copy(sharing = true, error = null, enqueued = false) }
            runCatching {
                val user = apiClient.resolveUser(username)
                outboxRepository.enqueueShare(
                    resourceId = resourceId,
                    resourceType = resourceType,
                    granteeUserId = user.id,
                    access = access,
                )
            }.onSuccess {
                OutboxSyncWorker.enqueue(appContext)
                Timber.d("share: op enqueued for %s", resourceId)
                _uiState.update { it.copy(sharing = false, enqueued = true) }
            }.onFailure { e ->
                val error = when {
                    e is ApiException && e.code == "NOT_FOUND" -> "USER_NOT_FOUND"
                    else -> "SHARE_FAILED"
                }
                Timber.w(e, "share failed")
                _uiState.update { it.copy(sharing = false, error = error) }
            }
        }
    }

    /** Consomme l'état clone (succès/erreur affiché) avant de rouvrir le sheet. */
    fun reset() {
        _uiState.value = ShareUiState()
    }

    override fun onCleared() {
        super.onCleared()
    }
}