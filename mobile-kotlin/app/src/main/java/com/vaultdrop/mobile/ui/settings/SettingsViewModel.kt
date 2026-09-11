package com.vaultdrop.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.domain.ThemePreference
import com.vaultdrop.mobile.domain.ThemePreferenceStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val themePreferenceStore: ThemePreferenceStore,
) : ViewModel() {

    val theme: StateFlow<ThemePreference> = themePreferenceStore.theme

    init {
        viewModelScope.launch { themePreferenceStore.load() }
    }

    fun setTheme(theme: ThemePreference) {
        viewModelScope.launch { themePreferenceStore.set(theme) }
    }
}