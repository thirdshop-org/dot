package com.vaultdrop.mobile.ui.document.content

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Lecteur PDF via `PdfRenderer` (API système, aucune dépendance).
 *
 * Le document est rendu page par page à la demande (une `LazyColumn`), la
 * largeur cible borne les bitmaps et un cache LRU limite la mémoire. Le
 * `PdfRenderer` n'est pas thread-safe : toutes les lectures passent par un
 * `Mutex` et un dispatcher IO.
 */
@Composable
fun PdfPageViewer(
    file: FileEntity,
    contentResolver: ContentResolver,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    onPageCountChanged: ((Int) -> Unit)? = null,
) {
    val uri = file.uri
    if (uri == null) {
        CloudOnlyPlaceholder(file, modifier)
        return
    }

    val document = remember(uri) { PdfDocumentState(contentResolver, uri) }
    var pageCount by remember(uri) { mutableIntStateOf(0) }
    var loadFailed by remember(uri) { mutableStateOf(false) }

    // Le state vit en mémoire (cache + dossier ouvert) tant que ce lecteur est
    // affiché ; il est fermé à la sortie ou au changement de document.
    DisposableEffect(document) {
        onDispose { document.close() }
    }

    LaunchedEffect(uri) {
        pageCount = 0
        loadFailed = false
        if (document.load()) {
            pageCount = document.pageCount
            onPageCountChanged?.invoke(pageCount)
        } else {
            loadFailed = true
        }
    }

    when {
        loadFailed -> UnreadableDocument(
            file = file,
            message = stringResource(R.string.document_cannot_read),
            onOpenExternalFailed = onOpenExternalFailed,
            modifier = modifier,
        )
        pageCount == 0 -> Box(modifier, contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        else -> BoxWithConstraints(modifier.fillMaxSize()) {
            val density = LocalDensity.current
            val maxWidthPx = with(density) { maxWidth.toPx().toInt() }
            val maxHeightPx = with(density) { maxHeight.toPx().toInt() }

            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(pageCount, key = { it }) { page ->
                    PdfPageItem(
                        document = document,
                        page = page,
                        maxWidthPx = maxWidthPx,
                        maxHeightPx = maxHeightPx,
                    )
                }
            }
        }
    }
}

@Composable
private fun PdfPageItem(
    document: PdfDocumentState,
    page: Int,
    maxWidthPx: Int,
    maxHeightPx: Int,
) {
    var bitmap by remember(page) { mutableStateOf<Bitmap?>(null) }
    var failed by remember(page) { mutableStateOf(false) }
    LaunchedEffect(document, page, maxWidthPx, maxHeightPx) {
        failed = false
        bitmap = document.bitmap(page, maxWidthPx, maxHeightPx)
        if (bitmap == null) failed = true
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        when {
            bitmap != null -> Image(
                bitmap = bitmap!!.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxWidth(),
            )
            failed -> Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(vertical = 32.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.BrokenImage,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.height(32.dp),
                )
                Text(
                    text = stringResource(R.string.document_page_unreadable),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(vertical = 32.dp),
            ) {
                CircularProgressIndicator()
            }
        }
    }
}

/**
 * État d'un document PDF : ouvre le `PdfRenderer` à la demande, rend chaque
 * page via le cache LRU et verrouille l'accès au renderer (non thread-safe).
 */
private class PdfDocumentState(
    private val contentResolver: ContentResolver,
    private val uri: String,
) {
    private var renderer: PdfRenderer? = null
    private val cache = LruCache<Int, Bitmap>(MAX_CACHED_PAGES)
    private val renderMutex = Mutex()

    val pageCount: Int get() = renderer?.pageCount ?: 0

    /** Ouvre le document si ce n'est pas déjà fait. Échoue si illisible. */
    suspend fun load(): Boolean = withContext(Dispatchers.IO) {
        if (renderer != null) return@withContext true
        val opened = runCatching {
            val pfd: ParcelFileDescriptor? = DocumentContent.openFileDescriptor(contentResolver, uri)
            if (pfd != null) PdfRenderer(pfd) else null
        }.getOrNull()
        if (opened == null) false else {
            renderer = opened
            true
        }
    }

    /** Bitmap de la page (mise à l'échelle pour tenir dans les limites). */
    suspend fun bitmap(page: Int, maxWidthPx: Int, maxHeightPx: Int): Bitmap? =
        withContext(Dispatchers.IO) {
            cache.get(page) ?: renderMutex.withLock {
                cache.get(page) ?: runCatching { renderPage(page, maxWidthPx, maxHeightPx) }
                    .getOrNull()
                    ?.also { cache.put(page, it) }
            }
        }

    private fun renderPage(page: Int, maxWidthPx: Int, maxHeightPx: Int): Bitmap {
        val current = renderer ?: error("document non ouvert")
        val pdfPage = current.openPage(page)
        try {
            val scale = minOf(
                1f,
                maxWidthPx.toFloat() / pdfPage.width,
                maxHeightPx.toFloat() / pdfPage.height,
            )
            val width = (pdfPage.width * scale).toInt().coerceAtLeast(1)
            val height = (pdfPage.height * scale).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            pdfPage.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            return bitmap
        } finally {
            pdfPage.close()
        }
    }

    fun close() {
        cache.snapshot().values.forEach { it.recycle() }
        cache.evictAll()
        renderer?.close()
        renderer = null
    }

    companion object {
        private const val MAX_CACHED_PAGES = 6
    }
}

/** Contenu "document non lisible" (charge, page corrompue, PDF chiffré…). */
@Composable
internal fun UnreadableDocument(
    file: FileEntity,
    message: String,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        androidx.compose.material3.Icon(
            imageVector = Icons.Filled.BrokenImage,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.height(48.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(16.dp))
        ExternalOpenButton(
            file = file,
            onOpenExternalFailed = onOpenExternalFailed,
        )
    }
}