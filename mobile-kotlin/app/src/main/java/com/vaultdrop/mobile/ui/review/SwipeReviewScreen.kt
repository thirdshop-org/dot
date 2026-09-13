package com.vaultdrop.mobile.ui.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.features.sync.SyncViewModel
import com.vaultdrop.mobile.ui.components.ServerStatusBadge
import com.vaultdrop.mobile.ui.components.SyncStatusAction
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeReviewScreen(
    onBack: () -> Unit,
    connectionStatusViewModel: ConnectionStatusViewModel,
    syncViewModel: SyncViewModel,
    viewModel: SwipeReviewViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val connectionStatus by connectionStatusViewModel.status.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val openExternalErrorMsg = stringResource(R.string.document_open_error)
    var confirmMarkAll by remember { androidx.compose.runtime.mutableStateOf(false) }

    LaunchedEffect(state.error) {
        state.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (state.remaining > 0) {
                            stringResource(R.string.review_remaining, state.remaining)
                        } else {
                            stringResource(R.string.review_title)
                        },
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
                actions = {
                    SyncStatusAction(syncViewModel = syncViewModel)
                    ServerStatusBadge(
                        status = connectionStatus,
                        onClick = connectionStatusViewModel::checkNow,
                    )
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        when {
            state.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }

            state.isFinished -> {
                ReviewFinished(
                    onBack = onBack,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                )
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    SwipeCardDeck(
                        cards = state.cards,
                        onOpenExternalFailed = {
                            scope.launch { snackbarHostState.showSnackbar(openExternalErrorMsg) }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                    )

                    ReviewActions(
                        onKeep = { state.cards.firstOrNull()?.let(viewModel::keep) },
                        onDelete = { state.cards.firstOrNull()?.let(viewModel::delete) },
                        modifier = Modifier.padding(top = 16.dp),
                    )

                    TextButton(onClick = { confirmMarkAll = true }) {
                        Text(stringResource(R.string.review_mark_all))
                    }
                }
            }
        }
    }

    if (confirmMarkAll) {
        Dialog(onDismissRequest = { confirmMarkAll = false }) {
            androidx.compose.material3.Surface(
                shape = MaterialTheme.shapes.medium,
                tonalElevation = 3.dp,
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Text(
                        text = stringResource(R.string.review_mark_all_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = stringResource(R.string.review_mark_all_message),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(onClick = { confirmMarkAll = false }) {
                            Text(stringResource(R.string.pdf_builder_cancel))
                        }
                        TextButton(
                            onClick = {
                                confirmMarkAll = false
                                viewModel.markAllProcessed()
                            },
                        ) {
                            Text(stringResource(R.string.review_mark_all))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewActions(
    onKeep: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(48.dp),
        verticalAlignment = Alignment.Top,
    ) {
        ReviewAction(
            icon = { tint, size -> Icon(imageVector = Icons.Filled.Close, contentDescription = stringResource(R.string.review_delete), tint = tint, modifier = Modifier.size(size)) },
            label = stringResource(R.string.review_delete),
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
            onClick = onDelete,
        )
        ReviewAction(
            icon = { tint, size -> Icon(imageVector = Icons.Filled.Check, contentDescription = stringResource(R.string.review_keep), tint = tint, modifier = Modifier.size(size)) },
            label = stringResource(R.string.review_keep),
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            onClick = onKeep,
        )
    }
}

@Composable
private fun ReviewAction(
    icon: @Composable (tint: Color, size: Dp) -> Unit,
    label: String,
    containerColor: Color,
    contentColor: Color,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        FloatingActionButton(
            onClick = onClick,
            shape = CircleShape,
            containerColor = containerColor,
            contentColor = contentColor,
            modifier = Modifier.size(64.dp),
        ) {
            icon(contentColor, 28.dp)
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun ReviewFinished(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.padding(horizontal = 32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.review_done),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            TextButton(onClick = onBack, modifier = Modifier.padding(top = 8.dp)) {
                Text(stringResource(R.string.review_finish))
            }
        }
    }
}