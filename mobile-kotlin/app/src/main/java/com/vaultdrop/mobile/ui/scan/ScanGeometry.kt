package com.vaultdrop.mobile.ui.scan

import android.graphics.PointF
import android.graphics.RectF
import kotlin.math.max
import kotlin.math.min

/**
 * Projections coordonnées image ⇄ écran pour le scanner.
 *
 * - FIT (image complète) : toute l'image est visible (letterbox).
 * - VIEWPORT (sous-région) : zoom sur un rectangle de l'image (zone détectée),
 *   affiché en FIT par rapport à la vue — utilisé pour le recadrage interactif.
 * - VISIBLE (caméra) : région réellement affichée par une vue FILL_CENTER
 *   (crop centré) — overlay du viewfinder, qui suit le flux pixel à pixel.
 */
object ScanGeometry {

    fun fitRect(imageWidth: Int, imageHeight: Int, viewWidth: Int, viewHeight: Int): RectF =
        viewportFit(RectF(0f, 0f, imageWidth.toFloat(), imageHeight.toFloat()), viewWidth, viewHeight)

    /** FIT d'une sous-région de l'image (`sourceRect`) dans la vue. */
    fun viewportFit(sourceRect: RectF, viewWidth: Int, viewHeight: Int): RectF {
        if (sourceRect.width() <= 0f || sourceRect.height() <= 0f) {
            return RectF(0f, 0f, viewWidth.toFloat(), viewHeight.toFloat())
        }
        if (viewWidth <= 0 || viewHeight <= 0) {
            return RectF(0f, 0f, viewWidth.toFloat(), viewHeight.toFloat())
        }
        val scale = min(viewWidth.toFloat() / sourceRect.width(), viewHeight.toFloat() / sourceRect.height())
        val shownW = sourceRect.width() * scale
        val shownH = sourceRect.height() * scale
        return RectF(
            (viewWidth - shownW) / 2f,
            (viewHeight - shownH) / 2f,
            (viewWidth + shownW) / 2f,
            (viewHeight + shownH) / 2f,
        )
    }

    /** Mappe un point *image* → coordonnées écran dans la région [sourceRect]. */
    fun mapRectToView(
        point: PointF,
        sourceRect: RectF,
        viewWidth: Int,
        viewHeight: Int,
    ): PointF {
        val dst = viewportFit(sourceRect, viewWidth, viewHeight)
        if (dst.width() <= 0f || dst.height() <= 0f) return point
        return PointF(
            dst.left + (point.x - sourceRect.left) / sourceRect.width() * dst.width(),
            dst.top + (point.y - sourceRect.top) / sourceRect.height() * dst.height(),
        )
    }

    /** Inverse de [mapRectToView] : écran → point *image*. */
    fun mapViewToRect(
        point: PointF,
        sourceRect: RectF,
        viewWidth: Int,
        viewHeight: Int,
    ): PointF {
        val dst = viewportFit(sourceRect, viewWidth, viewHeight)
        if (dst.width() <= 0f || dst.height() <= 0f) return point
        return PointF(
            sourceRect.left + (point.x - dst.left) / dst.width() * sourceRect.width(),
            sourceRect.top + (point.y - dst.top) / dst.height() * sourceRect.height(),
        )
    }

    /** Mappe des points image → coordonnées écran dans la région [sourceRect]. */
    fun mapPointsToView(
        points: List<PointF>,
        sourceRect: RectF,
        viewWidth: Int,
        viewHeight: Int,
    ): List<PointF> = points.map { mapRectToView(it, sourceRect, viewWidth, viewHeight) }

    /** Région *de l'image* visible dans une vue FILL_CENTER, en coordonnées image. */
    fun visibleRect(imageWidth: Int, imageHeight: Int, viewWidth: Int, viewHeight: Int): RectF {
        if (viewWidth <= 0 || viewHeight <= 0) {
            return RectF(0f, 0f, imageWidth.toFloat(), imageHeight.toFloat())
        }
        val scale = max(viewWidth.toFloat() / imageWidth, viewHeight.toFloat() / imageHeight)
        val shownW = viewWidth / scale
        val shownH = viewHeight / scale
        return RectF(
            (imageWidth - shownW) / 2f,
            (imageHeight - shownH) / 2f,
            (imageWidth + shownW) / 2f,
            (imageHeight + shownH) / 2f,
        )
    }

    /** Mappe des points image → coordonnées écran dans la région VISIBLE (caméra). */
    fun mapToVisibleView(
        points: List<PointF>,
        imageWidth: Int,
        imageHeight: Int,
        viewWidth: Int,
        viewHeight: Int,
    ): List<PointF> {
        val rect = visibleRect(imageWidth, imageHeight, viewWidth, viewHeight)
        if (rect.width() <= 0f || rect.height() <= 0f) return points
        return points.map { p ->
            PointF(
                (p.x - rect.left) / rect.width() * viewWidth,
                (p.y - rect.top) / rect.height() * viewHeight,
            )
        }
    }

    // Raccourcis image-complète (tests et usage générique conservés).
    fun mapToFitView(
        points: List<PointF>,
        imageWidth: Int,
        imageHeight: Int,
        viewWidth: Int,
        viewHeight: Int,
    ): List<PointF> =
        mapPointsToView(
            points,
            RectF(0f, 0f, imageWidth.toFloat(), imageHeight.toFloat()),
            viewWidth,
            viewHeight,
        )

    /** Inverse de la projection FIT (écran → image). */
    fun mapViewToFitImage(
        point: PointF,
        imageWidth: Int,
        imageHeight: Int,
        viewWidth: Int,
        viewHeight: Int,
    ): PointF =
        mapViewToRect(
            point,
            RectF(0f, 0f, imageWidth.toFloat(), imageHeight.toFloat()),
            viewWidth,
            viewHeight,
        )
}