package com.vaultdrop.mobile.ui.auth

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