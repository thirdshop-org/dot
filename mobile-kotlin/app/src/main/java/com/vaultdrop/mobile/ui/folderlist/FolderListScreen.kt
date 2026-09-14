package com.vaultdrop.mobile.ui.folderlist

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.features.saf.safDisplayName
import com.vaultdrop.mobile.features.sync.SyncViewModel
import com.vaultdrop.mobile.features.saf.FileDeleter
import com.vaultdrop.mobile.ui.components.DeleteConfirmDialog
import com.vaultdrop.mobile.ui.components.DeleteReview
import com.vaultdrop.mobile.ui.components.DeleteWarningDialog
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import com.vaultdrop.mobile.ui.components.FileSyncStatusIcon
import com.vaultdrop.mobile.ui.components.FolderNameDialog
import com.vaultdrop.mobile.ui.components.SelectionState
import com.vaultdrop.mobile.ui.components.SelectionStatusIcon
import com.vaultdrop.mobile.ui.components.ServerStatusBadge
import com.vaultdrop.mobile.ui.components.SyncStatusAction
import com.vaultdrop.mobile.ui.components.rememberSelectionState
import com.vaultdrop.mobile.ui.components.reviewDelete
import com.vaultdrop.mobile.ui.navigation.FloatingNavBar
import com.vaultdrop.mobile.ui.navigation.MoveTargetBar
import com.vaultdrop.mobile.ui.navigation.NavTab
import com.vaultdrop.mobile.ui.navigation.SelectionNavBar
import kotlinx.coroutines.delay
import timber.log.Timber
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolderListScreen(
    selectedTab: NavTab,
    onTabSelected: (NavTab) -> Unit,
    onOpenDocument: (String) -> Unit,
    onBuildPdf: (List<String>) -> Unit,
    syncViewModel: SyncViewModel,
    connectionStatusViewModel: ConnectionStatusViewModel,
    viewModel: FolderListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val importState by syncViewModel.importState.collectAsStateWithLifecycle()
    val connectionStatus by connectionStatusViewModel.status.collectAsStateWithLifecycle()
    val defaultRootId by viewModel.defaultRootId.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val selection = rememberSelectionState()
    var showCreateDialog by remember { mutableStateOf(false) }
    var showDeleteWarning by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var pendingDeleteMode by remember { mutableStateOf<FileDeleter.DeleteMode?>(null) }
    var pendingDeleteReview by remember { mutableStateOf<DeleteReview?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    val createError = uiState.createError
    LaunchedEffect(createError) {
        if (createError != null) {
            snackbarHostState.showSnackbar(createError)
            viewModel.clearCreateError()
        }
    }

    LaunchedEffect(uiState.moveError) {
        val moveError = uiState.moveError
        if (moveError != null) {
            snackbarHostState.showSnackbar(moveError)
            viewModel.clearMoveError()
        }
    }

    LaunchedEffect(uiState.moveSuccess) {
        if (uiState.moveSuccess) {
            snackbarHostState.showSnackbar(context.getString(R.string.move_success))
            viewModel.clearMoveSuccess()
        }
    }

    LaunchedEffect(uiState.deleteError) {
        val deleteError = uiState.deleteError
        if (deleteError != null) {
            snackbarHostState.showSnackbar(deleteError)
            viewModel.clearDeleteError()
        }
    }

    LaunchedEffect(uiState.deleteSuccess) {
        if (uiState.deleteSuccess) {
            snackbarHostState.showSnackbar(context.getString(R.string.delete))
            viewModel.clearDeleteSuccess()
        }
    }

    // Racine par défaut : dossier VaultDrop choisi au premier lancement.
    val defaultRootLabel = stringResource(R.string.default_root_folder_label)
    var pendingDefaultPick by remember { mutableStateOf<Uri?>(null) }
    val pickDefaultRootLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocumentTree(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }.onFailure { Timber.w(it, "persistable permission absent on default root pick") }
        pendingDefaultPick = uri
        val rootName = uri.safDisplayName(context) ?: uri.lastPathSegment ?: defaultRootLabel
        syncViewModel.importRoot(uri = uri.toString(), name = rootName)
    }

    // Attend la création de la racine (importRoot la sauvegarde puis lance le
    // walk), crée le sous-dossier « VaultDrop » et l'enregistre comme racine.
    LaunchedEffect(pendingDefaultPick) {
        val uri = pendingDefaultPick ?: return@LaunchedEffect
        val target = uri.toString()
        var attempts = 0
        while (attempts < 100) { // ~10 s max
            val rootId = syncViewModel.rootResourceId(target)
            if (rootId != null) {
                val vaultFolderId = viewModel.ensureVaultDropFolder(uri, rootId)
                if (vaultFolderId != null) {
                    pendingDefaultPick = null
                    viewModel.setDefaultRoot(vaultFolderId)
                    return@LaunchedEffect
                }
            }
            delay(100)
            attempts++
        }
        pendingDefaultPick = null
    }

    if (defaultRootId == null) {
        DefaultRootOnboarding(
            importing = importState.isImporting,
            error = importState.error,
            onPickFolder = { pickDefaultRootLauncher.launch(null) },
        )
        return
    }

    BackHandler(enabled = selection.active || uiState.moveMode) {
        if (uiState.moveMode) {
            viewModel.cancelMove()
        } else {
            selection.clear()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    when {
                        uiState.moveMode -> Text(stringResource(R.string.move_pick_title, selection.ids.size))
                        selection.active -> Text(stringResource(R.string.selection_count, selection.ids.size))
                        else -> Text(stringResource(R.string.files))
                    }
                },
                navigationIcon = {
                    if (uiState.moveMode || selection.active) {
                        IconButton(
                            onClick = {
                                if (uiState.moveMode) viewModel.cancelMove() else selection.clear()
                            },
                        ) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = stringResource(R.string.selection_cancel),
                            )
                        }
                    }
                },
                actions = {
                    if (!uiState.moveMode && !selection.active) {
                        SyncStatusAction(syncViewModel = syncViewModel)
                        ServerStatusBadge(
                            status = connectionStatus,
                            onClick = connectionStatusViewModel::checkNow,
                        )
                        IconButton(onClick = viewModel::refresh) {
                            Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.refresh))
                        }
                    }
                },
            )
        },
        bottomBar = {
            when {
                uiState.moveMode -> MoveTargetBar(
                    fileCount = selection.ids.size,
                    onMoveHere = {
                        val ids = selection.ids.toList()
                        selection.clear()
                        viewModel.moveSelectionHere(ids)
                    },
                )
                selection.active -> SelectionNavBar(
                    onMove = { viewModel.startMove() },
                    onBuildPdf = {
                        val ids = selection.ids.toList()
                        selection.clear()
                        onBuildPdf(ids)
                    },
                    onDeleteModeSelected = { mode ->
                        val allFiles = uiState.sections.flatMap { section ->
                            section.rows.flatMap { row -> listOfNotNull(row.left, row.right) }
                        }
                        val selectedFiles = allFiles.filter { it.resourceId in selection.ids }
                        val review = reviewDelete(selectedFiles, mode)
                        pendingDeleteMode = mode
                        pendingDeleteReview = review
                        if (review.hasWarning) {
                            showDeleteWarning = true
                        } else {
                            showDeleteConfirm = true
                        }
                    },
                    enabled = selection.ids.isNotEmpty(),
                )
                else -> FloatingNavBar(selected = selectedTab, onSelect = onTabSelected)
            }
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            HomeViewSelector(
                selected = uiState.view,
                enabled = !selection.active && !uiState.moveMode,
                onSelect = viewModel::selectView,
            )
            HomeViewContent(
                view = uiState.view,
                moveMode = uiState.moveMode,
                atRoot = uiState.browseFolderId == null,
                browseFolderName = uiState.browseFolderName,
                subFolders = uiState.browseSubFolders,
                sections = uiState.sections,
                isImporting = importState.isImporting,
                error = uiState.error ?: importState.error,
                selection = selection,
                onBrowseUp = viewModel::browseUp,
                onOpenBrowseFolder = viewModel::openBrowseFolder,
                onCreateFolder = { showCreateDialog = true },
                onOpenDocument = onOpenDocument,
                modifier = Modifier.weight(1f),
            )
        }
    }

    if (showCreateDialog) {
        FolderNameDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = { name ->
                showCreateDialog = false
                viewModel.createFolderInBrowse(name)
            },
        )
    }

    val deleteReview = pendingDeleteReview
    if (showDeleteWarning && deleteReview != null) {
        DeleteWarningDialog(
            review = deleteReview,
            onContinue = {
                showDeleteWarning = false
                showDeleteConfirm = true
            },
            onDismiss = {
                showDeleteWarning = false
                pendingDeleteMode = null
                pendingDeleteReview = null
            },
        )
    }

    if (showDeleteConfirm && pendingDeleteMode != null) {
        DeleteConfirmDialog(
            count = selection.ids.size,
            onConfirm = {
                val ids = selection.ids.toList()
                val mode = pendingDeleteMode!!
                selection.clear()
                showDeleteConfirm = false
                pendingDeleteMode = null
                pendingDeleteReview = null
                viewModel.deleteSelectedFiles(ids, mode)
            },
            onDismiss = {
                showDeleteConfirm = false
                pendingDeleteMode = null
                pendingDeleteReview = null
            },
        )
    }
}

/** Sélecteur de layer de la page Fichiers — même habillage pill que la nav flottante. */
@Composable
private fun HomeViewSelector(
    selected: HomeView,
    enabled: Boolean,
    onSelect: (HomeView) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(30.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp,
            modifier = Modifier
                .widthIn(max = 400.dp)
                .fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier.padding(vertical = 6.dp, horizontal = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ViewSegment(
                    label = stringResource(R.string.view_files),
                    icon = Icons.Filled.Description,
                    selected = selected == HomeView.FILES,
                    enabled = enabled,
                    onClick = { onSelect(HomeView.FILES) },
                    modifier = Modifier.weight(1f),
                )
                ViewSegment(
                    label = stringResource(R.string.view_folders),
                    icon = Icons.Filled.Folder,
                    selected = selected == HomeView.FOLDERS,
                    enabled = enabled,
                    onClick = { onSelect(HomeView.FOLDERS) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ViewSegment(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (selected) MaterialTheme.colorScheme.primary
    else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(20.dp),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer
        else MaterialTheme.colorScheme.surface,
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(22.dp),
                )
                Text(
                    text = label,
                    color = tint,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

/** Routage du contenu selon le layer affiché. */
@Composable
private fun HomeViewContent(
    view: HomeView,
    moveMode: Boolean,
    atRoot: Boolean,
    browseFolderName: String?,
    subFolders: List<FolderEntity>,
    sections: List<FileSection>,
    isImporting: Boolean,
    error: String?,
    selection: SelectionState,
    onBrowseUp: () -> Unit,
    onOpenBrowseFolder: (String) -> Unit,
    onCreateFolder: () -> Unit,
    onOpenDocument: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (view) {
        HomeView.FILES -> FileGridContent(
            sections = sections,
            isImporting = isImporting,
            error = error,
            selection = selection,
            onOpenDocument = onOpenDocument,
            modifier = modifier,
        )
        HomeView.FOLDERS -> FolderBrowserContent(
            moveMode = moveMode,
            atRoot = atRoot,
            browseFolderName = browseFolderName,
            subFolders = subFolders,
            isImporting = isImporting,
            error = error,
            onBrowseUp = onBrowseUp,
            onOpenBrowseFolder = onOpenBrowseFolder,
            onCreateFolder = onCreateFolder,
            modifier = modifier,
        )
    }
}

/** Layer Fichiers : tous les fichiers visibles, groupés par jour. */
@Composable
private fun FileGridContent(
    sections: List<FileSection>,
    isImporting: Boolean,
    error: String?,
    selection: SelectionState,
    onOpenDocument: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        if (isImporting) {
            item(key = "importing") {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )
            }
        }

        error?.let { message ->
            item(key = "error") {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )
            }
        }

        if (sections.isEmpty() && !isImporting) {
            item(key = "empty") {
                Text(
                    text = stringResource(R.string.no_files_yet),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                )
            }
        }

        sections.forEach { section ->
            item(key = "header-${section.dayKey}") {
                SectionHeader(section.dayLabel)
            }
            items(section.rows, key = { it.key }) { row ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    FileCard(
                        file = row.left,
                        selection = selection,
                        onClick = { onOpenDocument(row.left.resourceId) },
                        modifier = Modifier.weight(1f),
                    )
                    if (row.right != null) {
                        FileCard(
                            file = row.right,
                            selection = selection,
                            onClick = { onOpenDocument(row.right.resourceId) },
                            modifier = Modifier.weight(1f),
                        )
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** Layer Dossiers : explorateur hiérarchique, en place sur la page. */
@Composable
private fun FolderBrowserContent(
    moveMode: Boolean,
    atRoot: Boolean,
    browseFolderName: String?,
    subFolders: List<FolderEntity>,
    isImporting: Boolean,
    error: String?,
    onBrowseUp: () -> Unit,
    onOpenBrowseFolder: (String) -> Unit,
    onCreateFolder: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        item(key = "breadcrumb") {
            // La racine VaultDrop n'est pas affichée : on ne peut pas remonter au-dessus.
            if (atRoot) {
                Spacer(Modifier.height(8.dp))
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBrowseUp) {
                        Icon(
                            Icons.Filled.ArrowUpward,
                            contentDescription = stringResource(R.string.browse_up),
                        )
                    }
                    if (browseFolderName != null) {
                        Text(
                            text = browseFolderName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        if (!moveMode) {
            item(key = "create") {
                OutlinedButton(
                    onClick = onCreateFolder,
                    enabled = !isImporting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, bottom = 4.dp),
                ) {
                    Icon(Icons.Filled.CreateNewFolder, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.create_folder))
                }
            }
        }

        if (isImporting) {
            item(key = "importing") {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )
            }
        }

        error?.let { message ->
            item(key = "error") {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )
            }
        }

        items(subFolders, key = { it.resourceId }) { folder ->
            FolderRow(folder, onClick = { onOpenBrowseFolder(folder.resourceId) })
        }

        if (subFolders.isEmpty() && !isImporting) {
            item(key = "empty") {
                Text(
                    text = stringResource(if (atRoot) R.string.no_folders_yet else R.string.empty_folder),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                )
            }
        }
    }
}

/** Écran obligatoire du premier lancement : choix/création de la racine VaultDrop. */
@Composable
private fun DefaultRootOnboarding(
    importing: Boolean,
    error: String?,
    onPickFolder: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = stringResource(R.string.default_root_title),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.default_root_message),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Button(
                onClick = onPickFolder,
                enabled = !importing,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.default_root_pick))
            }
            if (importing) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            error?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(label: String) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

/** Carte dossier de l'explorateur — descend d'un niveau au tap. */
@Composable
private fun FolderRow(folder: FolderEntity, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Folder,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = folder.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = stringResource(R.string.folder),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Carte fichier — clic long pour la sélection multi-fichiers, clic pour ouvrir. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FileCard(
    file: FileEntity,
    selection: SelectionState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val selected = file.resourceId in selection.ids
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF7F8FA)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, Color(0xFFEAEAEA)),
        shape = RoundedCornerShape(10.dp),
        modifier = modifier.combinedClickable(
            onClick = {
                if (selection.active) selection.toggle(file.resourceId) else onClick()
            },
            onLongClick = {
                if (!selection.active) selection.start(file.resourceId)
            },
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                FileCategoryIcon(file = file, size = 36.dp)
                Spacer(Modifier.weight(1f))
                if (selection.active) {
                    SelectionStatusIcon(selected = selected)
                } else {
                    FileSyncStatusIcon(file = file, size = 20.dp)
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = file.name,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = formatSize(file.size),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Miroir de `formatSize` (app/index.tsx). */
@Composable
private fun formatSize(bytes: Long): String {
    if (bytes < 1_024) {
        return "$bytes ${stringResource(R.string.unit_bytes)}"
    }
    if (bytes < 1_024 * 1_024) {
        val kb = bytes / 1_024f
        return String.format(Locale.getDefault(), "%.1f %s", kb, stringResource(R.string.unit_kilobytes))
    }
    val mb = bytes / (1_024f * 1_024f)
    return String.format(Locale.getDefault(), "%.1f %s", mb, stringResource(R.string.unit_megabytes))
}