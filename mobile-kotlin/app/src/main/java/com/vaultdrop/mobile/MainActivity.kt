package com.vaultdrop.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.vaultdrop.mobile.domain.ThemePreferenceStore
import com.vaultdrop.mobile.ui.navigation.VaultDropApp
import com.vaultdrop.mobile.ui.theme.VaultDropTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var themePreferenceStore: ThemePreferenceStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        lifecycleScope.launch { themePreferenceStore.load() }

        setContent {
            val theme by themePreferenceStore.theme.collectAsStateWithLifecycle()
            VaultDropTheme(theme = theme) {
                VaultDropApp()
            }
        }
    }
}