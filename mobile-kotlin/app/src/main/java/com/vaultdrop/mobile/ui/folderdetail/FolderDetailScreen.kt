package com.vaultdrop.mobile.ui.folderdetail

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
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolderDetailScreen(
    folderResourceId: String,
    onBack: () -> Unit,
    onOpenFolder: (String) -> Unit,
    viewModel: FolderDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState.folderMissing) {
        if (uiState.folderMissing) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.folder?.name ?: stringResource(R.string.folder)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.refresh))
                    }
                },
            )
        },
    ) { padding ->
        FolderDetailContent(
            subFolders = uiState.subFolders,
            files = uiState.files,
            isRefreshing = uiState.isRefreshing,
            error = uiState.error,
            onOpenFolder = onOpenFolder,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
private fun FolderDetailContent(
    subFolders: List<FolderEntity>,
    files: List<FileEntity>,
    isRefreshing: Boolean,
    error: String?,
    onOpenFolder: (String) -> Unit,
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
            FileRow(file)
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

@Composable
private fun FileRow(file: FileEntity) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
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
                imageVector = Icons.Filled.InsertDriveFile,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp),
            )
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