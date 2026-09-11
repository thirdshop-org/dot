package com.vaultdrop.mobile.ui.auth

import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.remote.dto.UserDto

/** État global de connexion — équivalent de `AuthStatus` JS. */
sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data object Local : AuthState
    data class SignedIn(val user: UserDto) : AuthState
}

data class LoginUiState(
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

/** Mappe un code d'erreur contractuel vers une ressource de libellé (login). */
internal fun authErrorResFor(code: String): Int = when (code) {
    "REQUIRED" -> R.string.login_error_required
    "UNAUTHORIZED" -> R.string.login_error_unauthorized
    else -> R.string.login_error_generic
}