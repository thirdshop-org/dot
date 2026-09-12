package com.vaultdrop.mobile.ui.pdfbuilder

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MergeType
import androidx.compose.material.icons.filled.TextSnippet
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfBuilderScreen(
    initialResourceIds: List<String>,
    onBack: () -> Unit,
    onOpenDocument: (String) -> Unit,
    viewModel: PdfBuilderViewModel = hiltViewModel(),
) {
    val items by viewModel.items.collectAsStateWithLifecycle()
    val buildPhase by viewModel.buildState.collectAsStateWithLifecycle()
    val availableFiles by viewModel.availableFiles.collectAsStateWithLifecycle()

    val snackbarHostState = remember { SnackbarHostState() }

    var showNoteDialog by remember { mutableStateOf(false) }
    var showFileSheet by remember { mutableStateOf(false) }
    var showNameDialog by remember { mutableStateOf(false) }

    // Nom suggéré par défaut : date du jour au format jour-mois-année.
    val defaultPdfName = remember {
        "${LocalDate.now().format(DEFAULT_DATE_FORMAT)}.pdf"
    }

    LaunchedEffect(initialResourceIds) {
        viewModel.loadInitial(initialResourceIds)
    }

    LaunchedEffect(buildPhase) {
        when (buildPhase) {
            is BuildPhase.Ready -> showNameDialog = true
            is BuildPhase.Saved -> onOpenDocument((buildPhase as BuildPhase.Saved).resourceId)
            is BuildPhase.Failed -> {
                snackbarHostState.showSnackbar((buildPhase as BuildPhase.Failed).message)
                viewModel.acknowledgeFailure()
            }
            else -> Unit
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.pdf_builder_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when (buildPhase) {
                is BuildPhase.Building -> LinearProgressIndicator(
                    progress = { (buildPhase as BuildPhase.Building).progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                )

                else -> Spacer(Modifier.height(8.dp))
            }

            if (showNameDialog) {
                NamePdfDialog(
                    defaultName = defaultPdfName,
                    onDismiss = { showNameDialog = false },
                    onConfirm = { name ->
                        showNameDialog = false
                        viewModel.saveAndImport(name)
                    },
                )
            }

            if (showNoteDialog) {
                AddNoteDialog(
                    onDismiss = { showNoteDialog = false },
                    onConfirm = { body ->
                        viewModel.addNote(body)
                        showNoteDialog = false
                    },
                )
            }

            if (showFileSheet) {
                SelectFilesSheet(
                    files = availableFiles,
                    existingIds = items.mapNotNull { item ->
                        (item as? PdfBuilderItem.FileItem)?.file?.resourceId
                    }.toSet(),
                    onDismiss = { showFileSheet = false },
                    onConfirm = { ids ->
                        viewModel.addFiles(ids.toList())
                        showFileSheet = false
                    },
                )
            }

            if (items.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.pdf_builder_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 32.dp),
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(items, key = { it.id }) { item ->
                        BuilderItemRow(
                            item = item,
                            onMoveUp = { viewModel.moveUp(item.id) },
                            onMoveDown = { viewModel.moveDown(item.id) },
                            onRemove = { viewModel.removeItem(item.id) },
                        )
                    }
                }
            }

            BuilderActions(
                onAddFile = { showFileSheet = true },
                onAddNote = { showNoteDialog = true },
                onAssemble = {
                    if (buildPhase is BuildPhase.Ready) showNameDialog = true
                    else viewModel.generate()
                },
                enabled = items.isNotEmpty(),
                building = buildPhase is BuildPhase.Building,
                modifier = Modifier.padding(16.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectFilesSheet(
    files: List<FileEntity>,
    existingIds: Set<String>,
    onDismiss: () -> Unit,
    onConfirm: (Set<String>) -> Unit,
) {
    var selected by remember(files) { mutableStateOf(existingIds.toMutableSet()) }
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Text(
            text = stringResource(R.string.pdf_builder_pick_files),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(files, key = { it.resourceId }) { file ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            if (file.resourceId in selected) selected.remove(file.resourceId)
                            else selected.add(file.resourceId)
                        }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FileCategoryIcon(file = file, size = 24.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = file.name,
                            style = MaterialTheme.typography.bodyLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = formatSize(file.size),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = if (file.resourceId in selected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                        },
                    )
                }
            }
        }
        Button(
            onClick = { onConfirm(selected) },
            enabled = selected.isNotEmpty(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.pdf_builder_add_files))
        }
    }
}

@Composable
private fun NamePdfDialog(
    defaultName: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember { mutableStateOf(defaultName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.pdf_builder_name_title)) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = { Text(stringResource(R.string.pdf_builder_name_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name.trim()) },
                enabled = name.isNotBlank(),
            ) {
                Text(stringResource(R.string.pdf_builder_name_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.pdf_builder_cancel))
            }
        },
    )
}

@Composable
private fun AddNoteDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var body by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.pdf_builder_add_note)) },
        text = {
            OutlinedTextField(
                value = body,
                onValueChange = { body = it },
                placeholder = { Text(stringResource(R.string.pdf_builder_note_hint)) },
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(body) },
                enabled = body.isNotBlank(),
            ) {
                Text(stringResource(R.string.pdf_builder_add))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.pdf_builder_cancel))
            }
        },
    )
}

@Composable
private fun BuilderItemRow(
    item: PdfBuilderItem,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when (item) {
                is PdfBuilderItem.FileItem -> FileCategoryIcon(file = item.file, size = 24.dp)
                is PdfBuilderItem.NoteItem -> Icon(
                    imageVector = Icons.Filled.TextSnippet,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                val isFailed = item is PdfBuilderItem.FileItem && item.failed
                Text(
                    text = when (item) {
                        is PdfBuilderItem.FileItem -> item.file.name
                        is PdfBuilderItem.NoteItem -> stringResource(R.string.pdf_builder_note)
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (isFailed) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = when (item) {
                        is PdfBuilderItem.FileItem -> if (isFailed) {
                            stringResource(R.string.pdf_builder_unreadable)
                        } else {
                            formatSize(item.file.size)
                        }

                        is PdfBuilderItem.NoteItem -> item.body
                            .replace('\n', ' ')
                            .take(80)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isFailed) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(4.dp))
            IconButton(onClick = onMoveUp) {
                Icon(Icons.Filled.KeyboardArrowUp, contentDescription = stringResource(R.string.pdf_builder_move_up))
            }
            IconButton(onClick = onMoveDown) {
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = stringResource(R.string.pdf_builder_move_down))
            }
            IconButton(onClick = onRemove) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.pdf_builder_remove))
            }
        }
    }
}

@Composable
private fun BuilderActions(
    onAddFile: () -> Unit,
    onAddNote: () -> Unit,
    onAssemble: () -> Unit,
    enabled: Boolean,
    building: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onAddFile,
                enabled = !building,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.pdf_builder_add_files))
            }
            OutlinedButton(
                onClick = onAddNote,
                enabled = !building,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Filled.TextSnippet, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.pdf_builder_add_note))
            }
        }
        Button(
            onClick = onAssemble,
            enabled = enabled && !building,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Filled.MergeType, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.pdf_builder_assemble))
        }
    }
}

private val DEFAULT_DATE_FORMAT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd-MM-yyyy")

private fun formatSize(bytes: Long): String {
    if (bytes < 1_024) return "$bytes o"
    if (bytes < 1_024 * 1_024) {
        return String.format(Locale.getDefault(), "%.1f ko", bytes / 1_024f)
    }
    return String.format(Locale.getDefault(), "%.1f Mo", bytes / (1_024f * 1_024f))
}