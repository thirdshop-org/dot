package com.vaultdrop.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vaultdrop.mobile.ui.folderlist.FolderListScreen

object Routes {
    const val FILES = "files"
}

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = Routes.FILES,
    ) {
        composable(Routes.FILES) {
            FolderListScreen()
        }
    }
}