package com.vaultdrop.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.auth.SessionManager
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionManager: SessionManager,
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _loginUiState = MutableStateFlow(LoginUiState())
    val loginUiState: StateFlow<LoginUiState> = _loginUiState.asStateFlow()

    init {
        // 401 sur un endpoint protégé (token expiré/révoqué, compte supprimé)
        // → purge de la session. Le 401 du login est exonéré (skip dans ApiClient).
        apiClient.onUnauthorized = { signOut() }

        viewModelScope.launch {
            val session = sessionManager.restore()
            _authState.value =
                if (session != null) AuthState.SignedIn(session.user) else AuthState.SignedOut
            authRepository.registerDevice()
        }
    }

    fun signIn(username: String, password: String) {
        if (username.isBlank() || password.isBlank()) {
            _loginUiState.update { it.copy(error = "REQUIRED") }
            return
        }
        viewModelScope.launch {
            _loginUiState.update { LoginUiState(isSubmitting = true) }
            runCatching { authRepository.login(username, password) }
                .onSuccess { response ->
                    sessionManager.save(response.token, response.user)
                    _loginUiState.value = LoginUiState()
                    _authState.value = AuthState.SignedIn(response.user)
                }
                .onFailure { e ->
                    val error = when (e) {
                        is ApiException -> e.code
                        else -> "GENERIC"
                    }
                    _loginUiState.update { it.copy(isSubmitting = false, error = error) }
                }
        }
    }

    fun continueWithoutAccount() {
        _authState.value = AuthState.Local
    }

    /** Purge la session et revient en mode local (sans repasser par le login). */
    fun signOutToLocal() {
        viewModelScope.launch {
            Timber.d("auth: session purgée (mode local)")
            withContext(Dispatchers.IO) {
                sessionManager.clear()
            }
            _authState.value = AuthState.Local
        }
    }

    fun signOut() {
        viewModelScope.launch {
            Timber.d("auth: session purgée (signOut)")
            withContext(Dispatchers.IO) {
                sessionManager.clear()
            }
            _authState.value = AuthState.SignedOut
        }
    }

    override fun onCleared() {
        apiClient.onUnauthorized = null
    }
}