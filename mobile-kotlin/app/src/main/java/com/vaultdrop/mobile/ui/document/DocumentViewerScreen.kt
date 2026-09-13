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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.features.connection.ConnectionStatusViewModel
import com.vaultdrop.mobile.features.sync.SyncViewModel
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
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
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
        }
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