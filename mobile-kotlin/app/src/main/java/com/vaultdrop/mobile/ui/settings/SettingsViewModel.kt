package com.vaultdrop.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.domain.ServerConfigStore
import com.vaultdrop.mobile.domain.ThemePreference
import com.vaultdrop.mobile.domain.ThemePreferenceStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val themePreferenceStore: ThemePreferenceStore,
    private val serverConfigStore: ServerConfigStore,
) : ViewModel() {

    val theme: StateFlow<ThemePreference> = themePreferenceStore.theme

    private val _serverUrl = MutableStateFlow(serverConfigStore.current)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _testUiState = MutableStateFlow(ServerTestUiState())
    val testUiState: StateFlow<ServerTestUiState> = _testUiState.asStateFlow()

    init {
        viewModelScope.launch {
            themePreferenceStore.load()
            serverConfigStore.load()
            _serverUrl.value = serverConfigStore.current
        }
    }

    fun setTheme(theme: ThemePreference) {
        viewModelScope.launch { themePreferenceStore.set(theme) }
    }

    /** Persiste la base serveur au fil de la frappe (affichage = saisie brute). */
    fun onServerUrlChange(url: String) {
        _serverUrl.value = url
        viewModelScope.launch { serverConfigStore.set(url) }
    }

    /** Ping `/health` sur l'URL saisie (même non sauvegardée). */
    fun testConnection() {
        val url = _serverUrl.value
        if (url.isBlank()) {
            Timber.w("settings: test HTTP sur URL vide")
            _testUiState.value = ServerTestUiState(success = false)
            return
        }
        viewModelScope.launch {
            _testUiState.value = ServerTestUiState(isTesting = true)
            _testUiState.value = serverConfigStore.checkHealth(url).fold(
                onSuccess = { ServerTestUiState(success = true) },
                onFailure = { e ->
                    Timber.d(e, "settings: test serveur échoué")
                    ServerTestUiState(success = false)
                },
            )
        }
    }
}

data class ServerTestUiState(
    val isTesting: Boolean = false,
    /** null = pas encore testé ; true/false = résultat du dernier test. */
    val success: Boolean? = null,
)