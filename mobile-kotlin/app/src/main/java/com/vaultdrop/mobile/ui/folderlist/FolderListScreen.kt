package com.vaultdrop.mobile.ui.folderlist

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MergeType
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.features.sync.SyncViewModel
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import com.vaultdrop.mobile.ui.components.SelectionState
import com.vaultdrop.mobile.ui.components.SelectionStatusIcon
import com.vaultdrop.mobile.ui.components.ServerStatusBadge
import com.vaultdrop.mobile.ui.components.rememberSelectionState
import com.vaultdrop.mobile.ui.navigation.FloatingNavBar
import com.vaultdrop.mobile.ui.navigation.NavTab
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
    val folderLabel = stringResource(R.string.folder)
    val selection = rememberSelectionState()

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
        val rootName = uri.displayName(context) ?: uri.lastPathSegment ?: defaultRootLabel
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

    val pickFolderLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocumentTree(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        // Permissions persistantes : l'app ré-ouvrira le dossier aux prochains lancements.
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }
        syncViewModel.importRoot(
            uri = uri.toString(),
            name = uri.displayName(context) ?: uri.lastPathSegment ?: folderLabel,
        )
    }

    if (defaultRootId == null) {
        DefaultRootOnboarding(
            importing = importState.isImporting,
            error = importState.error,
            onPickFolder = { pickDefaultRootLauncher.launch(null) },
        )
        return
    }

    BackHandler(enabled = selection.active) { selection.clear() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (selection.active) {
                        Text(stringResource(R.string.selection_count, selection.ids.size))
                    } else {
                        Text(stringResource(R.string.files))
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
                    }
                },
                actions = {
                    if (selection.active) {
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
            FloatingNavBar(selected = selectedTab, onSelect = onTabSelected)
        },
    ) { padding ->
        FolderListContent(
            uiState = uiState,
            isImporting = importState.isImporting,
            error = uiState.error ?: importState.error,
            selection = selection,
            onAddFolder = { pickFolderLauncher.launch(null) },
            onOpenDocument = onOpenDocument,
            modifier = Modifier.padding(padding),
        )
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

/** Nom affiché d'un dossier SAF via DocumentsContract (DISPLAY_NAME). */
private fun Uri.displayName(context: Context): String? = runCatching {
    val docId = DocumentsContract.getTreeDocumentId(this)
    val docUri = DocumentsContract.buildDocumentUriUsingTree(this, docId)
    context.contentResolver.query(
        docUri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
    )?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }
}.getOrNull()

@Composable
private fun FolderListContent(
    uiState: FolderListUiState,
    isImporting: Boolean,
    error: String?,
    selection: SelectionState,
    onAddFolder: () -> Unit,
    onOpenDocument: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        item(key = "actions") {
            Button(
                onClick = onAddFolder,
                enabled = !isImporting,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.add_folder))
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

        if (uiState.sections.isEmpty() && !isImporting) {
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

        uiState.sections.forEach { section ->
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
                if (selection.active) {
                    Spacer(Modifier.weight(1f))
                    SelectionStatusIcon(selected = selected)
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