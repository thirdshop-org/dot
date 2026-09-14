package com.vaultdrop.mobile.ui.document

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.features.saf.FileDeleter
import com.vaultdrop.mobile.features.sync.SyncViewModel
import com.vaultdrop.mobile.ui.components.DeleteConfirmDialog
import com.vaultdrop.mobile.ui.components.ServerStatusBadge
import com.vaultdrop.mobile.ui.components.SyncStatusAction
import com.vaultdrop.mobile.ui.components.categoryValue
import com.vaultdrop.mobile.ui.document.content.DocumentContentViewer
import com.vaultdrop.mobile.ui.document.content.ImageViewer
import com.vaultdrop.mobile.ui.document.content.PdfFocusViewer
import com.vaultdrop.mobile.ui.document.content.TextFocusViewer
import com.vaultdrop.mobile.ui.document.content.ZoomableContent
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Consultation d'un document : lecteur intégré (PDF / image / texte) ou fallback
 * externe, carte de métadonnées, navigation au swipe entre les documents (même
 * fil que l'écran d'accueil).
 *
 * Les documents locaux lisibles (PDF, image, texte) passent en mode focus sur
 * tap : barres système et barre d'outils masquées, fond noir, un tap ou le
 * retour système quitte le mode.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentViewerScreen(
    initialResourceId: String,
    onBack: () -> Unit,
    connectionStatusViewModel: ConnectionStatusViewModel,
    syncViewModel: SyncViewModel,
    viewModel: DocumentViewerViewModel = hiltViewModel(),
) {
    val documents by viewModel.documents.collectAsStateWithLifecycle()
    val viewerState by viewModel.uiState.collectAsStateWithLifecycle()
    val connectionStatus by connectionStatusViewModel.status.collectAsStateWithLifecycle()
    val pagerState = rememberPagerState(pageCount = { documents.size })

    // Démarre une seule fois sur le document demandé, dès que la liste est chargée.
    var jumpPending by remember { mutableStateOf(true) }
    LaunchedEffect(documents) {
        if (jumpPending) {
            val index = documents.indexOfFirst { it.resourceId == initialResourceId }
            if (index >= 0) {
                pagerState.scrollToPage(index)
                jumpPending = false
            }
        } else if (documents.isEmpty()) {
            // Dernier document supprimé : plus rien à afficher → retour.
            onBack()
        }
    }

    val currentFile = documents.getOrNull(pagerState.currentPage)

    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val onOpenExternalFailed: () -> Unit = {
        scope.launch {
            snackbarHostState.showSnackbar(context.getString(R.string.document_open_error))
        }
    }

    // Erreurs / succès transitoires (suppression, garder) → Snackbar puis effacés.
    LaunchedEffect(viewerState.deleteError) {
        viewerState.deleteError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearDeleteError()
        }
    }
    LaunchedEffect(viewerState.keepMessage) {
        viewerState.keepMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearKeepMessage()
        }
    }

    // Confirmation avant suppression d'un document déjà traité.
    var pendingDeleteMode by remember { mutableStateOf<FileDeleter.DeleteMode?>(null) }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    var fullscreen by rememberSaveable { mutableStateOf(false) }
    val canFullscreen = currentFile?.canFocus() == true

    // Mode immersif : masque les barres système en plein écran, les restaure
    // à la sortie ou si l'écran est composé autrement.
    val view = LocalView.current
    DisposableEffect(fullscreen, canFullscreen) {
        val window = (view.context as? Activity)?.window
        if (window != null) {
            val controller = WindowCompat.getInsetsController(window, view)
            if (fullscreen && canFullscreen) {
                controller.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
        onDispose {
            val restoredWindow = (view.context as? Activity)?.window
            if (restoredWindow != null) {
                WindowCompat.getInsetsController(restoredWindow, view)
                    .show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    // En plein écran, retour système = retour à la vue classique plutôt que de
    // quitter le document.
    BackHandler(enabled = fullscreen && canFullscreen) { fullscreen = false }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            if (!(fullscreen && canFullscreen)) {
                TopAppBar(
                    title = {
                        Text(
                            text = currentFile?.name ?: stringResource(R.string.document),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
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
            }
        },
    ) { padding ->
        val current = currentFile
        if (fullscreen && canFullscreen && current != null) {
            FocusDocumentReader(
                file = current,
                onOpenExternalFailed = onOpenExternalFailed,
                onExitFullscreen = { fullscreen = false },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                ) { page ->
                    val file = documents.getOrNull(page)
                    if (file != null) {
                        DocumentViewerPage(
                            file = file,
                            onOpenExternalFailed = onOpenExternalFailed,
                            onEnterFullscreen = file.canFocus()
                                .takeIf { it }
                                ?.let { { fullscreen = true } },
                        )
                    }
                }
                // Barre d'action fixe pilotée par le document affiché : garder
                // ou supprimer un document en attente de review, ou supprimer
                // (local / cloud / les deux) un document déjà traité.
                if (current != null) {
                    DocumentActionBar(
                        file = current,
                        busy = viewerState.busy,
                        onKeep = { viewModel.keep(current) },
                        onDeleteModeSelected = { mode ->
                            pendingDeleteMode = mode
                            showDeleteConfirm = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }

    if (showDeleteConfirm && pendingDeleteMode != null && currentFile != null) {
        DeleteConfirmDialog(
            count = 1,
            onConfirm = {
                val mode = pendingDeleteMode!!
                val file = currentFile!!
                showDeleteConfirm = false
                pendingDeleteMode = null
                viewModel.delete(file, mode)
            },
            onDismiss = {
                showDeleteConfirm = false
                pendingDeleteMode = null
            },
        )
    }
}

/**
 * Lecteur focus du document courant : dispatch par catégorie.
 *
 * - PDF → une page par écran, défilement vertical, pastille de page
 * - IMAGE → document plein écran sur fond noir
 * - TEXT → lecture immersive (fond sombre, texte clair, sélectionnable)
 *
 * Le retour (tap ou bouton système) est géré par le cadre commun [FocusScaffold].
 */
@Composable
private fun FocusDocumentReader(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
    onExitFullscreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (file.categoryValue()) {
        FileCategory.PDF -> PdfFullscreenReader(
            file = file,
            onOpenExternalFailed = onOpenExternalFailed,
            onExitFullscreen = onExitFullscreen,
            modifier = modifier,
        )
        FileCategory.IMAGE -> ImageFullscreenReader(
            file = file,
            onExitFullscreen = onExitFullscreen,
            modifier = modifier,
        )
        FileCategory.TEXT -> TextFullscreenReader(
            file = file,
            onExitFullscreen = onExitFullscreen,
            modifier = modifier,
        )
        else -> Unit
    }
}

/**
 * Cadre commun du mode focus : fond noir plein écran, un tap (l'indicatrice de
 * position est optionnelle) quitte le mode.
 */
@Composable
private fun FocusScaffold(
    file: FileEntity,
    onExitFullscreen: () -> Unit,
    modifier: Modifier = Modifier,
    position: String? = null,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(file.resourceId) {
                detectTapGestures(onTap = { onExitFullscreen() })
            },
    ) {
        content()
        if (position != null) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 16.dp),
                shape = RoundedCornerShape(percent = 50),
                color = MaterialTheme.colorScheme.inverseSurface.copy(alpha = 0.85f),
            ) {
                Text(
                    text = position,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.inverseOnSurface,
                )
            }
        }
    }
}

/** Lecture PDF focus : une page par écran, swipe vertical, pastille de page. */
@Composable
private fun PdfFullscreenReader(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
    onExitFullscreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var pageCount by remember(file.resourceId) { mutableIntStateOf(0) }
    val pagerState = rememberPagerState(pageCount = { pageCount })
    var zoom by remember(file.resourceId) { mutableFloatStateOf(1f) }

    FocusScaffold(
        file = file,
        onExitFullscreen = onExitFullscreen,
        modifier = modifier,
        position = if (pageCount > 0) "${pagerState.currentPage + 1} / $pageCount" else null,
    ) {
        ZoomableContent(
            modifier = Modifier.fillMaxSize(),
            onScaleChanged = { zoom = it },
        ) {
            PdfFocusViewer(
                file = file,
                contentResolver = LocalContext.current.contentResolver,
                onOpenExternalFailed = onOpenExternalFailed,
                pagerState = pagerState,
                modifier = Modifier.fillMaxSize(),
                onPageCountChanged = { pageCount = it },
                renderScale = pdfRenderScale(zoom),
            )
        }
    }
}

/** Image focus : l'image remplit l'écran (fit), pincable sur fond noir. */
@Composable
private fun ImageFullscreenReader(
    file: FileEntity,
    onExitFullscreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentResolver = LocalContext.current.contentResolver
    val uri = file.uri
    if (uri == null) {
        return
    }

    FocusScaffold(
        file = file,
        onExitFullscreen = onExitFullscreen,
        modifier = modifier,
    ) {
        ZoomableContent(modifier = Modifier.fillMaxSize()) {
            ImageViewer(
                contentResolver = contentResolver,
                uri = uri,
                contentDescription = file.name,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** Texte focus : lecture immersive fond sombre, texte clair, sélectionnable. */
@Composable
private fun TextFullscreenReader(
    file: FileEntity,
    onExitFullscreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentResolver = LocalContext.current.contentResolver
    val uri = file.uri
    if (uri == null) {
        return
    }

    FocusScaffold(
        file = file,
        onExitFullscreen = onExitFullscreen,
        modifier = modifier,
    ) {
        TextFocusViewer(
            contentResolver = contentResolver,
            uri = uri,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun DocumentViewerPage(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
    onEnterFullscreen: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .then(
                    if (onEnterFullscreen != null) Modifier.pointerInput(onEnterFullscreen) {
                        detectTapGestures(onTap = { onEnterFullscreen() })
                    } else Modifier,
                ),
        ) {
            // Lecteur central : dispatch par catégorie (PDF / image / texte /
            // délégation externe), état dédié pour les fichiers cloud-only.
            DocumentContentViewer(
                file = file,
                onOpenExternalFailed = onOpenExternalFailed,
                modifier = Modifier.fillMaxSize(),
            )
        }

        Spacer(Modifier.height(16.dp))

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Column(modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)) {
                MetadataRow(stringResource(R.string.document_size), formatSize(file.size))
                MetadataRow(stringResource(R.string.document_type), fileTypeLabel(file))
                MetadataRow(stringResource(R.string.document_added_at), formatDateTime(file.addedAt))
                file.lastModified?.let { lastModified ->
                    MetadataRow(stringResource(R.string.document_modified_at), formatDateTime(lastModified))
                }
            }
        }
    }
}

/**
 * Barre d'action fixe du document affiché.
 *
 * - Document en attente de review (`processed = false`, fichier physique) :
 *   badge « À traiter » + boutons GARDER / SUPPRIMER (même sémantique que le
 *   mode swipe : garder pousse le `create_resource`, supprimer efface le fichier).
 * - Document déjà traité : bouton « Supprimer » dont les options (local, cloud,
 *   les deux) sont conditionnées au placement du fichier ([deleteModesFor]).
 */
@Composable
private fun DocumentActionBar(
    file: FileEntity,
    busy: Boolean,
    onKeep: () -> Unit,
    onDeleteModeSelected: (FileDeleter.DeleteMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pendingReview = !file.processed && file.uri != null
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 3.dp,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (pendingReview) {
                Surface(
                    shape = RoundedCornerShape(percent = 50),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Text(
                        text = stringResource(R.string.file_pending_review),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(48.dp)) {
                    DocumentActionButton(
                        icon = Icons.Filled.Close,
                        contentDescription = stringResource(R.string.review_delete),
                        label = stringResource(R.string.review_delete),
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        enabled = !busy,
                        onClick = { onDeleteModeSelected(FileDeleter.DeleteMode.LOCALLY) },
                    )
                    DocumentActionButton(
                        icon = Icons.Filled.Check,
                        contentDescription = stringResource(R.string.review_keep),
                        label = stringResource(R.string.review_keep),
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        enabled = !busy,
                        onClick = onKeep,
                    )
                }
            } else {
                DocumentDeleteMenu(
                    file = file,
                    enabled = !busy,
                    onModeSelected = onDeleteModeSelected,
                )
            }
        }
    }
}

/** Bouton rond d'action (garder / supprimer), style mode review mais compact. */
@Composable
private fun DocumentActionButton(
    icon: ImageVector,
    contentDescription: String,
    label: String,
    containerColor: Color,
    contentColor: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        FloatingActionButton(
            onClick = { if (enabled) onClick() },
            shape = CircleShape,
            containerColor = containerColor,
            contentColor = contentColor,
            modifier = Modifier
                .size(56.dp)
                .alpha(if (enabled) 1f else 0.38f),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/**
 * Bouton « Supprimer ▼ » avec dropdown ne proposant que les modes compatibles
 * avec le placement du fichier (une seule entrée pour un fichier purement
 * local ou cloud-only).
 */
@Composable
private fun DocumentDeleteMenu(
    file: FileEntity,
    enabled: Boolean,
    onModeSelected: (FileDeleter.DeleteMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val modes = deleteModesFor(file)
    var expanded by remember { mutableStateOf(false) }
    val tint = if (enabled) MaterialTheme.colorScheme.error
    else MaterialTheme.colorScheme.onSurfaceVariant

    Box(modifier = modifier) {
        Surface(
            onClick = { if (enabled) expanded = true },
            enabled = enabled,
            shape = RoundedCornerShape(20.dp),
            color = if (enabled) MaterialTheme.colorScheme.errorContainer
            else MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Box(
                modifier = Modifier.size(width = 88.dp, height = 48.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = null,
                        tint = tint,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = stringResource(R.string.delete),
                        color = tint,
                        fontSize = 11.sp,
                        maxLines = 1,
                        fontWeight = FontWeight.Bold,
                    )
                    Icon(
                        imageVector = Icons.Filled.ArrowDropDown,
                        contentDescription = null,
                        tint = tint,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            modes.forEach { mode ->
                DropdownMenuItem(
                    text = { Text(deleteModeLabel(mode)) },
                    onClick = {
                        expanded = false
                        onModeSelected(mode)
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun deleteModeLabel(mode: FileDeleter.DeleteMode): String = when (mode) {
    FileDeleter.DeleteMode.LOCALLY -> stringResource(R.string.delete_locally)
    FileDeleter.DeleteMode.IN_CLOUD -> stringResource(R.string.delete_in_cloud)
    FileDeleter.DeleteMode.FULL -> stringResource(R.string.delete_full)
}

@Composable
private fun MetadataRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun fileTypeLabel(file: FileEntity): String =
    file.extension?.takeIf { it.isNotBlank() }?.uppercase(Locale.getDefault())
        ?: file.mimeType?.uppercase(Locale.getDefault())
        ?: "—"

/** Vrai si le fichier est local et appartient à une catégorie consultable en mode focus. */
private fun FileEntity.canFocus(): Boolean =
    uri != null && categoryValue() in FOCUS_CATEGORIES

private val FOCUS_CATEGORIES = setOf(FileCategory.PDF, FileCategory.IMAGE, FileCategory.TEXT)

/** Résolution de rendu PDF en fonction du zoom : re-rendu par paliers pour rester net. */
private fun pdfRenderScale(zoom: Float): Float = when {
    zoom >= 2.5f -> 3f
    zoom >= 1.5f -> 2f
    else -> 1f
}

private fun formatDateTime(millis: Long): String {
    val locale = Locale.getDefault()
    val dateTime = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDateTime()
    val day = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(dateTime)
    val time = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(dateTime)
    return "$day $time"
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