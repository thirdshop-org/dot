package com.vaultdrop.mobile.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.features.sync.SyncViewModel
import com.vaultdrop.mobile.ui.auth.AuthViewModel
import com.vaultdrop.mobile.ui.dashboard.DashboardScreen
import com.vaultdrop.mobile.ui.document.DocumentViewerScreen
import com.vaultdrop.mobile.ui.folderdetail.FolderDetailScreen
import com.vaultdrop.mobile.ui.folderlist.FolderListScreen
import com.vaultdrop.mobile.ui.pdfbuilder.PdfBuilderScreen
import com.vaultdrop.mobile.ui.review.SwipeReviewScreen
import com.vaultdrop.mobile.ui.scan.ScanFlowScreen
import com.vaultdrop.mobile.ui.search.SearchScreen
import com.vaultdrop.mobile.ui.settings.SettingsScreen
import com.vaultdrop.mobile.ui.watchedfolders.WatchedFoldersScreen

object Routes {
    const val FILES = "files"
    const val SEARCH = "search"
    const val SETTINGS = "settings"
    const val DASHBOARD = "dashboard"
    const val REVIEW = "review"
    const val WATCHED_FOLDERS = "watched"
    const val FOLDER_DETAIL = "folder/{folderResourceId}"
    const val ARG_FOLDER = "folderResourceId"
    const val DOCUMENT = "document/{documentResourceId}"
    const val ARG_DOCUMENT = "documentResourceId"
    const val PDF_BUILDER = "pdfbuilder/{ids}"
    const val ARG_BUILDER_IDS = "ids"
    const val SCAN = "scan"

    fun folder(folderResourceId: String): String = "folder/$folderResourceId"
    fun document(documentResourceId: String): String = "document/$documentResourceId"
    fun pdfBuilder(resourceIds: List<String>): String = "pdfbuilder/${resourceIds.joinToString(",")}"
}

private fun String?.toNavTab(): NavTab = when (this) {
    Routes.FILES -> NavTab.FILES
    Routes.SEARCH -> NavTab.SEARCH
    Routes.SETTINGS -> NavTab.SETTINGS
    Routes.DASHBOARD -> NavTab.DASHBOARD
    else -> NavTab.FILES
}

@Composable
fun NavGraph(
    authViewModel: AuthViewModel,
    syncViewModel: SyncViewModel,
    connectionStatusViewModel: ConnectionStatusViewModel,
) {
    val navController = rememberNavController()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val selectedTab = backStackEntry?.destination?.route.toNavTab()

    val importState by syncViewModel.importState.collectAsStateWithLifecycle()

    val onOpenWatchedFolders = { navController.navigate(Routes.WATCHED_FOLDERS) }

    val onTabSelected: (NavTab) -> Unit = { tab ->
        if (tab.route != selectedTab.route) {
            navController.navigate(tab.route) {
                // Sauve l'entrée courante (Fichiers) au lieu de la détruire :
                // le ViewModel (et sa position d'exploration) survit au changement
                // d'onglet, sinon « Créer un dossier » retombe sur la racine.
                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = Routes.FILES,
        ) {
            composable(Routes.FILES) {
                FolderListScreen(
                    selectedTab = selectedTab,
                    onTabSelected = onTabSelected,
                    onOpenDocument = { id -> navController.navigate(Routes.document(id)) },
                    onBuildPdf = { ids -> navController.navigate(Routes.pdfBuilder(ids)) },
                    onOpenScan = { navController.navigate(Routes.SCAN) },
                    syncViewModel = syncViewModel,
                    connectionStatusViewModel = connectionStatusViewModel,
                )
            }
            composable(Routes.SEARCH) {
                SearchScreen(
                    selectedTab = selectedTab,
                    onTabSelected = onTabSelected,
                    onOpenDocument = { id -> navController.navigate(Routes.document(id)) },
                    onBuildPdf = { ids -> navController.navigate(Routes.pdfBuilder(ids)) },
                    connectionStatusViewModel = connectionStatusViewModel,
                    syncViewModel = syncViewModel,
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    selectedTab = selectedTab,
                    onTabSelected = onTabSelected,
                    onOpenWatchedFolders = onOpenWatchedFolders,
                    authViewModel = authViewModel,
                    connectionStatusViewModel = connectionStatusViewModel,
                    syncViewModel = syncViewModel,
                )
            }
            composable(Routes.DASHBOARD) {
                DashboardScreen(
                    selectedTab = selectedTab,
                    onTabSelected = onTabSelected,
                    connectionStatusViewModel = connectionStatusViewModel,
                    syncViewModel = syncViewModel,
                    onOpenReview = { navController.navigate(Routes.REVIEW) },
                    onOpenScan = { navController.navigate(Routes.SCAN) },
                )
            }
            composable(Routes.SCAN) {
                ScanFlowScreen(
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.REVIEW) {
                SwipeReviewScreen(
                    onBack = { navController.popBackStack() },
                    connectionStatusViewModel = connectionStatusViewModel,
                    syncViewModel = syncViewModel,
                )
            }
            composable(Routes.WATCHED_FOLDERS) {
                WatchedFoldersScreen(
                    onBack = { navController.popBackStack() },
                    syncViewModel = syncViewModel,
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
                    onOpenDocument = { id -> navController.navigate(Routes.document(id)) },
                    onBuildPdf = { ids -> navController.navigate(Routes.pdfBuilder(ids)) },
                    connectionStatusViewModel = connectionStatusViewModel,
                    syncViewModel = syncViewModel,
                )
            }
            composable(
                route = Routes.DOCUMENT,
                arguments = listOf(
                    navArgument(Routes.ARG_DOCUMENT) { type = NavType.StringType },
                ),
            ) { backStackEntry ->
                val documentId = checkNotNull(
                    backStackEntry.arguments?.getString(Routes.ARG_DOCUMENT),
                )
                DocumentViewerScreen(
                    initialResourceId = documentId,
                    onBack = { navController.popBackStack() },
                    connectionStatusViewModel = connectionStatusViewModel,
                    syncViewModel = syncViewModel,
                )
            }
            composable(
                route = Routes.PDF_BUILDER,
                arguments = listOf(
                    navArgument(Routes.ARG_BUILDER_IDS) { type = NavType.StringType },
                ),
            ) { backStackEntry ->
                val ids = backStackEntry.arguments
                    ?.getString(Routes.ARG_BUILDER_IDS)
                    .orEmpty()
                    .split(",")
                    .filter { it.isNotBlank() }
                PdfBuilderScreen(
                    initialResourceIds = ids,
                    onBack = { navController.popBackStack() },
                    onOpenDocument = { id ->
                        navController.navigate(Routes.document(id)) {
                            popUpTo(Routes.PDF_BUILDER) { inclusive = true }
                        }
                    },
                )
            }
        }

        // Bandeau global : visible sur tous les onglets tant qu'un import SAF
        // est en cours (indique que la marche continue hors écran Fichiers).
        if (importState.isImporting) {
            LinearProgressIndicator(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
            )
        }
    }
}
