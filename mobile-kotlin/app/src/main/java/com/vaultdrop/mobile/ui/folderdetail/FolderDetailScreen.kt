package com.vaultdrop.mobile.ui.folderdetail

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.DriveFileMove
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MergeType
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import com.vaultdrop.mobile.ui.components.FolderNameDialog
import com.vaultdrop.mobile.ui.components.MoveFolderPickerDialog
import com.vaultdrop.mobile.ui.components.SelectionState
import com.vaultdrop.mobile.ui.components.SelectionStatusIcon
import com.vaultdrop.mobile.ui.components.ServerStatusBadge
import com.vaultdrop.mobile.ui.components.rememberSelectionState
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolderDetailScreen(
    folderResourceId: String,
    onBack: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenDocument: (String) -> Unit,
    onBuildPdf: (List<String>) -> Unit,
    connectionStatusViewModel: ConnectionStatusViewModel,
    viewModel: FolderDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val connectionStatus by connectionStatusViewModel.status.collectAsStateWithLifecycle()
    val selection = rememberSelectionState()
    var showCreateDialog by remember { mutableStateOf(false) }
    var showMoveDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.folderMissing) {
        if (uiState.folderMissing) onBack()
    }

    LaunchedEffect(uiState.createError) {
        val createError = uiState.createError
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

    LaunchedEffect(showMoveDialog) {
        if (showMoveDialog) viewModel.loadMoveFolders()
    }

    BackHandler(enabled = selection.active) { selection.clear() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (selection.active) {
                        Text(stringResource(R.string.selection_count, selection.ids.size))
                    } else {
                        Text(uiState.folder?.name ?: stringResource(R.string.folder))
                    }
                },
                navigationIcon = {
                    if (selection.active) {
                        IconButton(onClick = { selection.clear() }) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = stringResource(R.string.selection_cancel),
                            )
                        }
                    } else {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.back),
                            )
                        }
                    }
                },
                actions = {
                    if (selection.active) {
                        IconButton(
                            onClick = { showMoveDialog = true },
                            enabled = selection.ids.isNotEmpty(),
                        ) {
                            Icon(
                                Icons.Filled.DriveFileMove,
                                contentDescription = stringResource(R.string.move_files),
                            )
                        }
                        IconButton(
                            onClick = {
                                val ids = selection.ids.toList()
                                selection.clear()
                                onBuildPdf(ids)
                            },
                            enabled = selection.ids.isNotEmpty(),
                        ) {
                            Icon(
                                Icons.Filled.MergeType,
                                contentDescription = stringResource(R.string.selection_assemble),
                            )
                        }
                    } else {
                        IconButton(onClick = { showCreateDialog = true }) {
                            Icon(
                                Icons.Filled.CreateNewFolder,
                                contentDescription = stringResource(R.string.create_folder),
                            )
                        }
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
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { padding ->
        FolderDetailContent(
            subFolders = uiState.subFolders,
            files = uiState.files,
            isRefreshing = uiState.isRefreshing,
            error = uiState.error,
            selection = selection,
            onOpenFolder = onOpenFolder,
            onOpenDocument = onOpenDocument,
            modifier = Modifier.padding(padding),
        )
    }

    if (showCreateDialog) {
        FolderNameDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = { name ->
                showCreateDialog = false
                viewModel.createFolder(name)
            },
        )
    }

    val moveFolders = uiState.moveFolders
    if (showMoveDialog && moveFolders != null) {
        MoveFolderPickerDialog(
            folders = moveFolders,
            fileCount = selection.ids.size,
            onDismiss = {
                showMoveDialog = false
                viewModel.closeMovePicker()
            },
            onConfirm = { folderId ->
                val ids = selection.ids.toList()
                selection.clear()
                showMoveDialog = false
                viewModel.moveSelectedFiles(ids, folderId)
            },
        )
    }
}

@Composable
private fun FolderDetailContent(
    subFolders: List<FolderEntity>,
    files: List<FileEntity>,
    isRefreshing: Boolean,
    error: String?,
    selection: SelectionState,
    onOpenFolder: (String) -> Unit,
    onOpenDocument: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val empty = subFolders.isEmpty() && files.isEmpty() && !isRefreshing

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(subFolders, key = { it.resourceId }) { folder ->
            FolderRow(folder, onClick = { onOpenFolder(folder.resourceId) })
        }
        items(files, key = { it.resourceId }) { file ->
            FileRow(
                file = file,
                selection = selection,
                onOpenDocument = { onOpenDocument(file.resourceId) },
            )
        }
        when {
            empty -> {
                item(key = "empty") {
                    Text(
                        text = stringResource(R.string.empty_folder),
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
        if (error != null) {
            item(key = "error") {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun FolderRow(folder: FolderEntity, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FileRow(
    file: FileEntity,
    selection: SelectionState,
    onOpenDocument: () -> Unit,
) {
    val selected = file.resourceId in selection.ids
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = {
                    if (selection.active) selection.toggle(file.resourceId) else onOpenDocument()
                },
                onLongClick = {
                    if (!selection.active) selection.start(file.resourceId)
                },
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FileCategoryIcon(file = file, size = 24.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                )
                Text(
                    text = formatSize(file.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (selection.active) {
                SelectionStatusIcon(selected = selected)
            }
        }
    }
}

/** Miroir de `formatSize` (app/folder/[id].tsx). */
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