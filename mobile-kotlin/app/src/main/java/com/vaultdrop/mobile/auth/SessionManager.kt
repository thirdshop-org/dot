package com.vaultdrop.mobile.auth

import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.LoginResponseDto
import com.vaultdrop.mobile.domain.ActiveUserStore
import com.vaultdrop.mobile.domain.DeviceIdentity
import com.vaultdrop.mobile.domain.LocalModeStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Orchestration de la session (restauration/sauvegarde/purge) : relie le store
 * sécurisé, le miroir `active_user_id` et le token en mémoire lu par
 * `AuthInterceptor`. Le drapeau « mode local » est persisté à part
 * ([LocalModeStore]) pour survivre aux redémarrages.
 */
@Singleton
class SessionManager @Inject constructor(
    private val secureTokenStore: SecureTokenStore,
    private val activeUserStore: ActiveUserStore,
    private val tokenProvider: TokenProvider,
    private val localModeStore: LocalModeStore,
) {

    /** Restaure la session persistée (si présente), sinon null. */
    suspend fun restore(): AuthSession? {
        val token = secureTokenStore.getToken() ?: return null
        val user = secureTokenStore.getUser() ?: return null
        tokenProvider.current = token
        return AuthSession(token = token, user = user)
    }

    suspend fun save(token: String, user: com.vaultdrop.mobile.data.remote.dto.UserDto) {
        secureTokenStore.save(token, user)
        activeUserStore.set(user.id)
        localModeStore.clear()
        tokenProvider.current = token
    }

    suspend fun clear() {
        secureTokenStore.clear()
        activeUserStore.clear()
        tokenProvider.current = null
    }

    suspend fun isLocalMode(): Boolean = localModeStore.get()

    suspend fun setLocalMode() = localModeStore.set()

    suspend fun clearLocalMode() = localModeStore.clear()
}

data class AuthSession(
    val token: String,
    val user: com.vaultdrop.mobile.data.remote.dto.UserDto,
)