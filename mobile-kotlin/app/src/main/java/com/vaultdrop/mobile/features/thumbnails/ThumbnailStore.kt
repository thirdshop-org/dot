package com.vaultdrop.mobile.features.thumbnails

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.ui.components.categoryValue
import com.vaultdrop.mobile.ui.document.content.DocumentContent
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Vignettes locales des documents, stockées sous forme de petits fichiers WebP
 * dans `filesDir/thumbnails/<resourceId>.webp` — nom dérivé de l'identité
 * canonique, aucune colonne Room.
 *
 *  - **génération lazy** : uniquement pour les items visibles, à la demande
 *    depuis l'UI (`ensure`), single-flight par resourceId pour qu'une grille
 *    ne décode jamais deux fois le même fichier ;
 *  - **décodage borné** : jamais le bitmap plein-résolution — côté max
 *    [MAX_EDGE_PX] (512 px), en `inSampleSize` pour les images et page 0
 *    capée via `PdfRenderer` pour les PDF ;
 *  - **cache-hit à zéro SAF** : le thumbnail en place et plus récent que la
 *    source (`lastModified`) est retourné sans toucher au `ContentResolver` ;
 *    un fichier source modifié régénère à la volée (mtime compare) ;
 *  - **invalidation** : purge au delete des ressources (deleters).
 */
@Singleton
class ThumbnailStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val dir: File get() = dir()

    /** Clefs non-Android partagées en interne pour les tests. */
    internal val maxEdgePx: Int = MAX_EDGE_PX
    internal val webpQuality: Int = WEBP_QUALITY

    /** Single-flight par resourceId — une génération en cours = pas de doublon. */
    private val locks = ConcurrentHashMap<String, Mutex>()

    /** Fichier cible d'une resource — indépendant de la catégorie. */
    internal fun thumbnailFile(resourceId: String): File =
        File(dir(), "$resourceId.webp")

    /**
     * Vignette du fichier, générée si absente ou périmée. `null` si le fichier
     * n'est ni image ni PDF, n'a pas d'uri, ou si la génération échoue
     * (provider / PDF corrompu) — l'UI retombe alors sur l'icône de catégorie.
     */
    suspend fun ensure(file: FileEntity): File? {
        val uri = file.uri ?: return null
        val category = file.categoryValue()
        if (category != FileCategory.IMAGE && category != FileCategory.PDF) return null

        val target = thumbnailFile(file.resourceId)
        if (isUpToDate(target, file.lastModified)) return target

        val lock = locks.getOrPut(file.resourceId) { Mutex() }
        return lock.withLock {
            if (isUpToDate(target, file.lastModified)) target
            else generateInto(context.contentResolver, uri, category, target)
        }
    }

    /** Purge la vignette d'une resource (delete physique) — best-effort. */
    fun delete(resourceId: String) {
        runCatching { thumbnailFile(resourceId).delete() }
    }

    /** Cache-hit : fichier présent et au moins aussi récent que la source. */
    internal fun isUpToDate(target: File, lastModified: Long?): Boolean {
        if (!target.isFile) return false
        if (lastModified == null) return true
        return target.lastModified() >= lastModified
    }

    /** Génération brute : décode borné puis écriture WebP. Retourne `null` si KO. */
    internal suspend fun generateInto(
        resolver: ContentResolver,
        uri: String,
        category: FileCategory,
        target: File,
    ): File? = withContext(Dispatchers.IO) {
        val bitmap = when (category) {
            FileCategory.IMAGE -> decodeImage(resolver, uri)
            FileCategory.PDF -> renderPdfPage(resolver, uri)
            else -> null
        }
        bitmap ?: return@withContext null
        try {
            dir().mkdirs()
            val tmp = File(target.parentFile, "${target.name}.tmp")
            val ok = tmp.outputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.WEBP, WEBP_QUALITY, out)
            }
            if (ok && target.exists()) {
                // La source a bougé pendant notre génération : on garde la dernière.
                target.delete()
            }
            if (ok && tmp.renameTo(target)) target else null
        } catch (e: Exception) {
            Timber.w(e, "thumbnail write failed for $uri")
            runCatching { target.delete() }
            null
        } finally {
            bitmap.recycle()
        }
    }

    /** Image : décodage en `inSampleSize` pour ne jamais matérialiser le full-res. */
    private fun decodeImage(resolver: ContentResolver, uri: String): Bitmap? {
        val stream = DocumentContent.openInputStream(resolver, uri) ?: return null
        return try {
            // Première passe : dimensions seulement, sans décodage pixels.
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            stream.use { BitmapFactory.decodeStream(it, null, bounds) }
            val sample = inSampleSizeFor(bounds.outWidth, bounds.outHeight)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            val stream2 = DocumentContent.openInputStream(resolver, uri) ?: return null
            stream2.use {
                val opts = BitmapFactory.Options().apply { inSampleSize = sample }
                BitmapFactory.decodeStream(it, null, opts)
            }
        } catch (e: Exception) {
            Timber.w(e, "thumbnail decode failed for $uri")
            null
        }
    }

    internal fun inSampleSizeFor(width: Int, height: Int): Int {
        if (width <= 0 || height <= 0) return 1
        var sample = 1
        while ((width / sample) > MAX_EDGE_PX || (height / sample) > MAX_EDGE_PX) {
            sample *= 2
        }
        return sample
    }

    /**
     * PDF : rendu de la page 0 en `ARGB_8888`, dimensions gardées en
     * proportion et capées à [MAX_EDGE_PX] (pattern de `PdfDocumentState`).
     * Le renderer est refermé immédiatement — pas de cache LRU ici.
     */
    private fun renderPdfPage(resolver: ContentResolver, uri: String): Bitmap? {
        val pfd = DocumentContent.openFileDescriptor(resolver, uri) ?: return null
        var renderer: PdfRenderer? = null
        return try {
            val opened = PdfRenderer(pfd)
            renderer = opened
            if (opened.pageCount < 1) return null
            val page = opened.openPage(0)
            try {
                val scale = minOf(
                    MAX_EDGE_PX.toFloat() / page.width.toFloat(),
                    MAX_EDGE_PX.toFloat() / page.height.toFloat(),
                ).coerceAtMost(1f)
                val width = (page.width * scale).toInt().coerceAtLeast(1)
                val height = (page.height * scale).toInt().coerceAtLeast(1)
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                bitmap
            } finally {
                page.close()
            }
        } catch (e: Exception) {
            Timber.w(e, "thumbnail pdf render failed for $uri")
            null
        } finally {
            runCatching { renderer?.close() }
            runCatching { pfd.close() }
        }
    }

    private fun dir(): File {
        val d = File(context.filesDir, THUMBNAIL_DIR)
        if (!d.exists()) d.mkdirs()
        return d
    }

    private companion object {
        const val MAX_EDGE_PX = 512
        const val WEBP_QUALITY = 80
        const val THUMBNAIL_DIR = "thumbnails"
    }
}