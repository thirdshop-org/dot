package com.vaultdrop.mobile.features.connection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.domain.ServerConfigStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/** Statut de connexion au serveur affiché dans le header. */
sealed interface ServerConnectionStatus {
    /** Ping en cours (premier résultat pas encore reçu). */
    data object Checking : ServerConnectionStatus
    data object Online : ServerConnectionStatus
    data object Offline : ServerConnectionStatus
    /** Mode local : aucun compte, pas de synchro serveur (statut volontaire). */
    data object Local : ServerConnectionStatus
}

/**
 * Surveille la joignabilité du serveur configuré (ping `/health`) et expose le
 * résultat pour le badge du header. Scope Activity (créé dans [VaultDropApp]),
 * comme [SyncViewModel].
 *
 *  - ne ping que lorsqu'un compte est connecté ([TokenProvider.current] non nul),
 *    sinon le statut reste `Local` ;
 *  - boucle périodique + re-test immédiat quand l'URL de base change ;
 *  - [checkNow] relance une vérification à la demande (appui sur le badge).
 */
@HiltViewModel
class ConnectionStatusViewModel @Inject constructor(
    private val serverConfigStore: ServerConfigStore,
    private val tokenProvider: TokenProvider,
) : ViewModel() {

    private val _status = MutableStateFlow<ServerConnectionStatus>(ServerConnectionStatus.Checking)
    val status: StateFlow<ServerConnectionStatus> = _status.asStateFlow()

    private var baseUrlJob: Job? = null
    private var loopJob: Job? = null

    /** Démarre le moniteur une seule fois (idempotent). */
    fun start() {
        if (loopJob?.isActive == true) {
            // Bascule sign-in/out : ré-évaluer tout de suite.
            checkNow()
            return
        }
        baseUrlJob = viewModelScope.launch {
            serverConfigStore.baseUrl
                .drop(1)
                .distinctUntilChanged()
                .collectLatest { performCheck() }
        }
        loopJob = viewModelScope.launch {
            while (isActive) {
                performCheck()
                delay(CHECK_INTERVAL_MS)
            }
        }
    }

    /** Vérification immédiate (appui sur le badge). */
    fun checkNow() {
        viewModelScope.launch { performCheck() }
    }

    private suspend fun performCheck() {
        if (tokenProvider.current == null) {
            _status.value = ServerConnectionStatus.Local
            return
        }
        _status.value = ServerConnectionStatus.Checking
        _status.value = serverConfigStore.checkHealth(serverConfigStore.current).fold(
            onSuccess = { ServerConnectionStatus.Online },
            onFailure = { e ->
                Timber.d(e, "connection: ping /health échoué")
                ServerConnectionStatus.Offline
            },
        )
    }

    companion object {
        /** Cadence du ping — même cadence que la boucle de sync. */
        const val CHECK_INTERVAL_MS = 30_000L
    }
}