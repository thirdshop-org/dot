package com.vaultdrop.mobile.ui.pdfbuilder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.ui.components.categoryValue
import com.vaultdrop.mobile.ui.document.content.DocumentContent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import kotlin.coroutines.coroutineContext

/**
 * Générateur de PDF d'assemblage (APIs système, aucune dépendance).
 *
 * - PDF source → pages au format source conservé, rendues en bitmap
 *   (`PdfRenderer`, mode PRINT) puis dessinées dans le nouveau document.
 * - Image → page A4 portrait/paysage selon l'orientation, image centrée.
 * - Note → texte paginé vectoriel (`StaticLayout` : sélectionnable, léger).
 *
 * Les bitmaps sont recyclés page par page et la génération est annulable
 * (`ensureActive` par page). L'échec d'un item n'arrête pas le lot : les IDs
 * échoués sont retournés dans [PdfBuildResult].
 */
class PdfBuilderEngine @Inject constructor() {

    suspend fun buildPdf(
        context: Context,
        items: List<PdfBuilderItem>,
        outputFile: File,
        onProgress: (Float) -> Unit,
    ): PdfBuildResult = withContext(Dispatchers.IO) {
        val failed = ArrayList<String>()
        val total = items.size.coerceAtLeast(1)

        outputFile.outputStream().buffered().use { out ->
            val document = PdfDocument()
            try {
                items.forEachIndexed { index, item ->
                    coroutineContext.ensureActive()
                    onProgress(index.toFloat() / total)
                    val ok = when (item) {
                        is PdfBuilderItem.FileItem -> renderFileItem(context, document, item.file)
                        is PdfBuilderItem.NoteItem -> renderNoteItem(document, item.body)
                        is PdfBuilderItem.FilePathItem -> appendImageFile(document, item.file)
                    }
                    if (!ok) failed += item.id
                    onProgress((index + 1).toFloat() / total)
                }
                document.writeTo(out)
            } finally {
                document.close()
            }
        }
        PdfBuildResult(outputFile = outputFile, failedIds = failed)
    }

    // ------------------------------------------------------------------ PDF

    private suspend fun renderFileItem(
        context: Context,
        document: PdfDocument,
        file: FileEntity,
    ): Boolean = when (file.categoryValue()) {
        FileCategory.PDF -> appendPdf(context, document, file)
        FileCategory.IMAGE -> appendImage(context, document, file)
        FileCategory.TEXT -> appendTextFile(context, document, file)
        else -> false
    }

    private suspend fun appendPdf(
        context: Context,
        document: PdfDocument,
        file: FileEntity,
    ): Boolean {
        val uri = file.uri ?: return false
        val pfd = DocumentContent.openFileDescriptor(context.contentResolver, uri)
            ?: return false
        var renderer: PdfRenderer? = null
        var appended = false
        try {
            renderer = runCatching { PdfRenderer(pfd) }.getOrNull() ?: return false
            repeat(renderer.pageCount) { pageIndex ->
                coroutineContext.ensureActive()
                val page = renderer.openPage(pageIndex)
                try {
                    val srcW = page.width.toFloat()
                    val srcH = page.height.toFloat()
                    if (srcW <= 0f || srcH <= 0f) return@repeat

                    val maxDim = maxOf(srcW, srcH)
                    val scale = minOf(1f, MAX_PAGE_POINTS / maxDim, MAX_IMAGE_PX / maxDim)
                    val pageW = (srcW * scale).toInt().coerceAtLeast(1)
                    val pageH = (srcH * scale).toInt().coerceAtLeast(1)

                    val bitmap = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    appendBitmapPage(document, bitmap, pageW, pageH, dst = null)
                    bitmap.recycle()
                    appended = true
                } finally {
                    page.close()
                }
            }
            return appended
        } catch (_: Exception) {
            return appended
        } finally {
            renderer?.close()
            pfd.close()
        }
    }

    // ---------------------------------------------------------------- Image

    private fun appendImage(
        context: Context,
        document: PdfDocument,
        file: FileEntity,
    ): Boolean {        val uri = file.uri ?: return false

        val sample = runCatching {
            DocumentContent.openInputStream(context.contentResolver, uri)?.use { input ->
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeStream(input, null, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false
                var sampler = 1
                while (bounds.outWidth / sampler > MAX_IMAGE_PX ||
                    bounds.outHeight / sampler > MAX_IMAGE_PX
                ) {
                    sampler *= 2
                }
                sampler
            }
        }.getOrNull() ?: return false

        val bitmap = DocumentContent.openInputStream(context.contentResolver, uri)
            ?.use { input ->
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                BitmapFactory.decodeStream(input, null, options)
            }
            ?: return false

        val landscape = bitmap.width > bitmap.height
        val pageWidth = if (landscape) A4_H.toInt() else A4_W.toInt()
        val pageHeight = if (landscape) A4_W.toInt() else A4_H.toInt()
        val dst = fitRect(bitmap.width, bitmap.height, pageWidth.toFloat(), pageHeight.toFloat())
        appendBitmapPage(document, bitmap, pageWidth, pageHeight, dst)
        bitmap.recycle()
        return true
    }

    /** Page image brute sur disque (ex. JPEG scanné), A4 selon l'orientation. */
    private fun appendImageFile(
        document: PdfDocument,
        file: File,
    ): Boolean {
        val sample = runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false
            var sampler = 1
            while (bounds.outWidth / sampler > MAX_IMAGE_PX ||
                bounds.outHeight / sampler > MAX_IMAGE_PX
            ) {
                sampler *= 2
            }
            sampler
        }.getOrNull() ?: return false

        val bitmap = runCatching {
            val options = BitmapFactory.Options().apply { inSampleSize = sample }
            BitmapFactory.decodeFile(file.absolutePath, options)
        }.getOrNull() ?: return false

        val landscape = bitmap.width > bitmap.height
        val pageWidth = if (landscape) A4_H.toInt() else A4_W.toInt()
        val pageHeight = if (landscape) A4_W.toInt() else A4_H.toInt()
        val dst = fitRect(bitmap.width, bitmap.height, pageWidth.toFloat(), pageHeight.toFloat())
        appendBitmapPage(document, bitmap, pageWidth, pageHeight, dst)
        bitmap.recycle()
        return true
    }

    // ------------------------------------------------------------------ Texte

    private suspend fun appendTextFile(
        context: Context,
        document: PdfDocument,
        file: FileEntity,
    ): Boolean {
        val uri = file.uri ?: return false
        val stream = DocumentContent.openInputStream(context.contentResolver, uri)
            ?: return false
        stream.use { input ->
            val buffer = ByteArray(MAX_NOTE_CHARS * 4)
            var offset = 0
            while (offset < buffer.size) {
                val read = input.read(buffer, offset, buffer.size - offset)
                if (read < 0) break
                offset += read
            }
            val body = String(buffer, 0, offset, Charsets.UTF_8)
                .removePrefix("\uFEFF")
                .take(MAX_NOTE_CHARS)
            return renderNoteItem(document, body)
        }
    }

    private suspend fun renderNoteItem(
        document: PdfDocument,
        body: String,
    ): Boolean {
        val clean = body.replace('\u0000', ' ').trim()
        if (clean.isEmpty()) return true

        val textWidth = (A4_W - NOTE_MARGIN * 2f).toInt()
        val textHeight = A4_H - NOTE_MARGIN * 2f
        val paint = TextPaint().apply {
            isAntiAlias = true
            color = Color.BLACK
            textSize = NOTE_TEXT_SIZE
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
        }

        var remaining = clean
        var pages = 0
        try {
            while (remaining.isNotEmpty() && pages < MAX_NOTE_PAGES) {
                coroutineContext.ensureActive()
                val layout = buildLayout(remaining, textWidth, paint)
                if (layout.lineCount == 0) break

                val lineHeight: Float = if (layout.lineCount >= 2) {
                    (layout.getLineTop(1) - layout.getLineTop(0)).toFloat()
                } else {
                    paint.fontSpacing
                }
                if (lineHeight <= 0f) break

                val linesThatFit = (textHeight / lineHeight).toInt().coerceAtLeast(1)
                val lastLine = (linesThatFit - 1).coerceAtMost(layout.lineCount - 1)
                val endOffset = layout.getLineEnd(lastLine)
                if (endOffset <= 0) break

                val pageText = remaining.substring(0, endOffset)
                val pageLayout = buildLayout(pageText, textWidth, paint)
                val info = PdfDocument.PageInfo.Builder(A4_W.toInt(), A4_H.toInt(), pages).create()
                val page = document.startPage(info)
                page.canvas.drawColor(Color.WHITE)
                page.canvas.save()
                page.canvas.translate(NOTE_MARGIN, NOTE_MARGIN)
                pageLayout.draw(page.canvas)
                page.canvas.restore()
                document.finishPage(page)

                remaining = remaining.substring(endOffset).trimStart()
                pages++
            }
            return true
        } catch (_: Exception) {
            return false
        }
    }

    private fun buildLayout(text: String, width: Int, paint: TextPaint): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setLineSpacing(0f, LINE_SPACING)
            .setIncludePad(false)
            .build()

    // ------------------------------------------------------------- Common

    private fun appendBitmapPage(
        document: PdfDocument,
        bitmap: Bitmap,
        pageWidth: Int,
        pageHeight: Int,
        dst: RectF?,
    ) {
        val info = PdfDocument.PageInfo.Builder(
            pageWidth.coerceAtLeast(1),
            pageHeight.coerceAtLeast(1),
            document.pages.size,
        ).create()
        val page = document.startPage(info)
        page.canvas.drawColor(Color.WHITE)
        if (dst != null) {
            page.canvas.drawBitmap(bitmap, null, dst, SCALE_PAINT)
        } else {
            page.canvas.drawBitmap(
                bitmap,
                null,
                RectF(0f, 0f, pageWidth.toFloat(), pageHeight.toFloat()),
                SCALE_PAINT,
            )
        }
        document.finishPage(page)
    }

    /** Rectangle d'affichage d'une image centrée dans une page, marges incluses. */
    private fun fitRect(bmpW: Int, bmpH: Int, pageW: Float, pageH: Float): RectF {
        val availW = pageW - IMAGE_MARGIN * 2f
        val availH = pageH - IMAGE_MARGIN * 2f
        val scale = minOf(availW / bmpW, availH / bmpH).coerceAtMost(1f)
        val w = bmpW * scale
        val h = bmpH * scale
        val left = (pageW - w) / 2f
        val top = (pageH - h) / 2f
        return RectF(left, top, left + w, top + h)
    }

    companion object {
        private const val A4_W = 595f
        private const val A4_H = 842f
        private const val NOTE_MARGIN = 48f
        private const val NOTE_TEXT_SIZE = 11f
        private const val LINE_SPACING = 1.4f
        private const val IMAGE_MARGIN = 40f

        /** Bornes mémoire : pages et bitmaps jamais au-delà. */
        private const val MAX_PAGE_POINTS = 1200f
        private const val MAX_IMAGE_PX = 3000
        private const val MAX_NOTE_CHARS = 100_000
        private const val MAX_NOTE_PAGES = 30

        private val SCALE_PAINT = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    }
}

data class PdfBuildResult(
    val outputFile: File,
    val failedIds: List<String>,
)