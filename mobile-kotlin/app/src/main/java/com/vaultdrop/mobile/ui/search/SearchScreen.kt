package com.vaultdrop.mobile.ui.search

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import com.vaultdrop.mobile.ui.components.MoveFolderPickerDialog
import com.vaultdrop.mobile.ui.components.SelectionState
import com.vaultdrop.mobile.ui.components.SelectionStatusIcon
import com.vaultdrop.mobile.ui.components.ServerStatusBadge
import com.vaultdrop.mobile.ui.components.color
import com.vaultdrop.mobile.ui.components.icon
import com.vaultdrop.mobile.ui.components.rememberSelectionState
import com.vaultdrop.mobile.ui.navigation.FloatingNavBar
import com.vaultdrop.mobile.ui.navigation.NavTab
import com.vaultdrop.mobile.ui.navigation.SelectionNavBar
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    selectedTab: NavTab,
    onTabSelected: (NavTab) -> Unit,
    onOpenDocument: (String) -> Unit,
    onBuildPdf: (List<String>) -> Unit,
    connectionStatusViewModel: ConnectionStatusViewModel,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val connectionStatus by connectionStatusViewModel.status.collectAsStateWithLifecycle()
    val moveFolders by viewModel.moveFolders.collectAsStateWithLifecycle()
    val moveError by viewModel.moveError.collectAsStateWithLifecycle()
    val selection = rememberSelectionState()
    var showMoveDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(moveError) {
        val message = moveError
        if (message != null) {
            snackbarHostState.showSnackbar(message)
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
                        Text(stringResource(R.string.search))
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
                    if (!selection.active) {
                        ServerStatusBadge(
                            status = connectionStatus,
                            onClick = connectionStatusViewModel::checkNow,
                        )
                    }
                },
            )
        },
        bottomBar = {
            if (selection.active) {
                SelectionNavBar(
                    onMove = { showMoveDialog = true },
                    onBuildPdf = {
                        val ids = selection.ids.toList()
                        selection.clear()
                        onBuildPdf(ids)
                    },
                    enabled = selection.ids.isNotEmpty(),
                )
            } else {
                FloatingNavBar(selected = selectedTab, onSelect = onTabSelected)
            }
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { padding ->
        SearchContent(
            uiState = uiState,
            selection = selection,
            onQueryChange = viewModel::onQueryChange,
            onCategorySelect = viewModel::onCategorySelect,
            onOpenDocument = onOpenDocument,
            modifier = Modifier.padding(padding),
        )
    }

    val folders = moveFolders
    if (showMoveDialog && folders != null) {
        MoveFolderPickerDialog(
            folders = folders,
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
private fun SearchContent(
    uiState: SearchUiState,
    selection: SelectionState,
    onQueryChange: (String) -> Unit,
    onCategorySelect: (String?) -> Unit,
    onOpenDocument: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = uiState.query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.search_hint)) },
            singleLine = true,
            enabled = !selection.active,
        )

        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(key = "all") {
                CategoryChip(
                    label = stringResource(R.string.category_all),
                    selected = uiState.selectedCategory == null,
                    onClick = { onCategorySelect(null) },
                )
            }
            items(FileCategory.entries, key = { it.name }) { category ->
                CategoryChip(
                    label = categoryLabel(category),
                    selected = uiState.selectedCategory == category.dbValue,
                    onClick = { onCategorySelect(category.dbValue) },
                    category = category,
                )
            }
        }

        SearchResults(
            uiState = uiState,
            selection = selection,
            onOpenDocument = onOpenDocument,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun CategoryChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    category: FileCategory? = null,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = category?.let { cat ->
            {
                Icon(
                    imageVector = cat.icon,
                    contentDescription = null,
                    tint = cat.color,
                )
            }
        },
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color(0xFFF7F8FA),
        ),
    )
}

/** Libellé français de la catégorie (store = enum.name, affichage = label localisé). */
@Composable
private fun categoryLabel(category: FileCategory): String = when (category) {
    FileCategory.PDF -> stringResource(R.string.category_pdf)
    FileCategory.OFFICE -> stringResource(R.string.category_office)
    FileCategory.IMAGE -> stringResource(R.string.category_image)
    FileCategory.TEXT -> stringResource(R.string.category_text)
    FileCategory.VIDEO -> stringResource(R.string.category_video)
    FileCategory.AUDIO -> stringResource(R.string.category_audio)
    FileCategory.OTHER -> stringResource(R.string.category_other)
}

@Composable
private fun SearchResults(
    uiState: SearchUiState,
    selection: SelectionState,
    onOpenDocument: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasQuery = uiState.query.isNotBlank()

    when {
        !hasQuery && uiState.results.isEmpty() -> Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.search_empty),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp),
            )
        }

        hasQuery && uiState.results.isEmpty() -> Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.search_no_results),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        else -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (!hasQuery) {
                item(key = "recent-header") {
                    Text(
                        text = stringResource(R.string.search_recent),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            items(uiState.results, key = { it.resourceId }) { file ->
                SearchResultCard(
                    file = file,
                    selection = selection,
                    onOpenDocument = { onOpenDocument(file.resourceId) },
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SearchResultCard(
    file: FileEntity,
    selection: SelectionState,
    onOpenDocument: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val selected = file.resourceId in selection.ids
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF7F8FA)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, Color(0xFFEAEAEA)),
        shape = RoundedCornerShape(10.dp),
        modifier = modifier
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
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FileCategoryIcon(file = file, size = 28.dp)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = file.extension?.let { it.uppercase(Locale.getDefault()) } ?: formatSize(file.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(12.dp))
            if (selection.active) {
                SelectionStatusIcon(selected = selected)
            } else {
                Text(
                    text = formatSize(file.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

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