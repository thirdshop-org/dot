package com.vaultdrop.mobile.ui.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.features.sync.SyncViewModel
import com.vaultdrop.mobile.ui.auth.AuthState
import com.vaultdrop.mobile.ui.auth.AuthViewModel
import com.vaultdrop.mobile.ui.auth.LoginScreen

@Composable
private fun SplashScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
    }
}

/**
 * Gate racine : restaure la session puis oriente (login si signé out,
 * navigation principale si signé in / mode local).
 */
@Composable
fun VaultDropApp(
    authViewModel: AuthViewModel = hiltViewModel(),
    syncViewModel: SyncViewModel = hiltViewModel(),
) {
    val authState by authViewModel.authState.collectAsStateWithLifecycle()

    // Une fois la session résolue, lancer la boucle de fond (idempotente).
    LaunchedEffect(authState) {
        if (authState != AuthState.Loading) syncViewModel.ensureStarted()
    }

    when (authState) {
        AuthState.Loading -> SplashScreen()
        AuthState.SignedOut -> LoginScreen()
        AuthState.Local -> NavGraph(authViewModel = authViewModel, syncViewModel = syncViewModel)
        is AuthState.SignedIn -> NavGraph(authViewModel = authViewModel, syncViewModel = syncViewModel)
    }
}