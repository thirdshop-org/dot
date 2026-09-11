package com.vaultdrop.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vaultdrop.mobile.ui.folderdetail.FolderDetailScreen
import com.vaultdrop.mobile.ui.folderlist.FolderListScreen
import com.vaultdrop.mobile.ui.search.SearchScreen
import com.vaultdrop.mobile.ui.settings.SettingsScreen

object Routes {
    const val FILES = "files"
    const val SEARCH = "search"
    const val SETTINGS = "settings"
    const val FOLDER_DETAIL = "folder/{folderResourceId}"
    const val ARG_FOLDER = "folderResourceId"

    fun folder(folderResourceId: String): String = "folder/$folderResourceId"
}

private fun String?.toNavTab(): NavTab = when (this) {
    Routes.FILES -> NavTab.FILES
    Routes.SEARCH -> NavTab.SEARCH
    Routes.SETTINGS -> NavTab.SETTINGS
    else -> NavTab.FILES
}

@Composable
fun NavGraph() {
    val navController = rememberNavController()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val selectedTab = backStackEntry?.destination?.route.toNavTab()

    val onTabSelected: (NavTab) -> Unit = { tab ->
        if (tab.route != selectedTab.route) {
            navController.navigate(tab.route) {
                popUpTo(Routes.FILES) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.FILES,
    ) {
        composable(Routes.FILES) {
            FolderListScreen(
                selectedTab = selectedTab,
                onTabSelected = onTabSelected,
            )
        }
        composable(Routes.SEARCH) {
            SearchScreen(
                selectedTab = selectedTab,
                onTabSelected = onTabSelected,
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                selectedTab = selectedTab,
                onTabSelected = onTabSelected,
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
