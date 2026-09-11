package com.vaultdrop.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vaultdrop.mobile.ui.folderdetail.FolderDetailScreen
import com.vaultdrop.mobile.ui.folderlist.FolderListScreen

object Routes {
    const val FILES = "files"
    const val FOLDER_DETAIL = "folder/{folderResourceId}"
    const val ARG_FOLDER = "folderResourceId"

    fun folder(folderResourceId: String): String = "folder/$folderResourceId"
}

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = Routes.FILES,
    ) {
        composable(Routes.FILES) {
            FolderListScreen(
                onOpenFolder = { id -> navController.navigate(Routes.folder(id)) },
            )
        }
        composable(
            route = Routes.FOLDER_DETAIL,
            arguments = listOf(
                navArgument(Routes.ARG_FOLDER) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val folderId = checkNotNull(
                backStackEntry.arguments?.getString(Routes.ARG_FOLDER),
            )
            FolderDetailScreen(
                folderResourceId = folderId,
                onBack = { navController.popBackStack() },
                onOpenFolder = { id -> navController.navigate(Routes.folder(id)) },
            )
        }
    }
}