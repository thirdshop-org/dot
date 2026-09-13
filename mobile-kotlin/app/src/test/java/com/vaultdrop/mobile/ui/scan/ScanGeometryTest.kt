package com.vaultdrop.mobile.ui.scan

import android.graphics.PointF
import android.graphics.RectF
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ScanGeometryTest {

    private val imageWidth = 1080
    private val imageHeight = 1920

    // Écran portrait 1080x1600 : FIT = l'image est réduite pour tenir en
    // hauteur, avec bandes latérales (letterbox horizontal).
    private val viewWidth = 1080
    private val viewHeight = 1600

    // Zoom « recadrage » : sous-région de l'image 640x640 au centre.
    private val sourceRect = RectF(220f, 640f, 860f, 1280f)

    @Test
    fun fitRect_centre_l_image_dans_le_letterbox() {
        val rect = ScanGeometry.fitRect(imageWidth, imageHeight, viewWidth, viewHeight)
        // scale = min(1080/1080, 1600/1920) = 0.8333 → shown 900x1600
        assertEquals(90f, rect.left, 0.01f)
        assertEquals(0f, rect.top, 0.01f)
        assertEquals(900f, rect.width(), 0.01f)
        assertEquals(1600f, rect.height(), 0.01f)
    }

    @Test
    fun mapToFitView_suit_le_ratio_de_l_image() {
        val rect = ScanGeometry.fitRect(imageWidth, imageHeight, viewWidth, viewHeight)

        // Coin TL de l'image -> haut-gauche du letterbox.
        assertEquals(rect.left, map(0f, 0f).x, 0.01f)
        assertEquals(rect.top, map(0f, 0f).y, 0.01f)

        // Coin BR -> bas-droite du letterbox.
        assertEquals(rect.right, map(imageWidth.toFloat(), imageHeight.toFloat()).x, 0.01f)
        assertEquals(rect.bottom, map(imageWidth.toFloat(), imageHeight.toFloat()).y, 0.01f)

        // Centre de l'image -> centre du viewport (indépendant du letterbox).
        assertEquals(viewWidth / 2f, map(imageWidth / 2f, imageHeight / 2f).x, 0.01f)
        assertEquals(viewHeight / 2f, map(imageWidth / 2f, imageHeight / 2f).y, 0.01f)
    }

    @Test
    fun viewportFit_agrandit_une_sous_region_plein_ecran() {
        // Sous-région carrée 640x640 dans une vue 1080x1600 : FIT va la
        // contraindre par la largeur → 1080x1080, centrée verticalement.
        val dst = ScanGeometry.viewportFit(sourceRect, viewWidth, viewHeight)
        assertEquals(0f, dst.left, 0.01f)
        assertEquals((viewHeight - 1080f) / 2f, dst.top, 0.01f)
        assertEquals(1080f, dst.width(), 0.01f)
        assertEquals(1080f, dst.height(), 0.01f)
    }

    @Test
    fun mapViewToRect_est_l_inverse_de_mapRectToView() {
        val viewPoint = ScanGeometry.mapRectToView(PointF(540f, 960f), sourceRect, viewWidth, viewHeight)
        val back = ScanGeometry.mapViewToRect(viewPoint, sourceRect, viewWidth, viewHeight)
        assertEquals(540f, back.x, 0.01f)
        assertEquals(960f, back.y, 0.01f)
    }

    @Test
    fun mapViewToRect_mappe_les_bords_du_viewport_sur_les_bords_de_la_region() {
        val dst = ScanGeometry.viewportFit(sourceRect, viewWidth, viewHeight)

        // Coin TL du viewport affiché ↔ coin TL de la source.
        val tl = ScanGeometry.mapViewToRect(PointF(dst.left, dst.top), sourceRect, viewWidth, viewHeight)
        assertEquals(sourceRect.left, tl.x, 0.01f)
        assertEquals(sourceRect.top, tl.y, 0.01f)

        // Coin BR du viewport ↔ coin BR de la source.
        val br = ScanGeometry.mapViewToRect(PointF(dst.right, dst.bottom), sourceRect, viewWidth, viewHeight)
        assertEquals(sourceRect.right, br.x, 0.01f)
        assertEquals(sourceRect.bottom, br.y, 0.01f)
    }

    @Test
    fun mapPointsToView_garde_la_geometrie_du_quad() {
        val quad = listOf(
            PointF(220f, 640f),
            PointF(860f, 640f),
            PointF(860f, 1280f),
            PointF(220f, 1280f),
        )
        val dst = ScanGeometry.viewportFit(sourceRect, viewWidth, viewHeight)
        val mapped = ScanGeometry.mapPointsToView(quad, sourceRect, viewWidth, viewHeight)

        // Le rectangle image [220..860]x[640..1280] s'affiche en plein écran :
        // TL → coin haut-gauche, BR → coin bas-droite.
        assertEquals(dst.left, mapped[0].x, 0.01f)
        assertEquals(dst.top, mapped[0].y, 0.01f)
        assertEquals(dst.right, mapped[2].x, 0.01f)
        assertEquals(dst.bottom, mapped[2].y, 0.01f)

        // L'aire du quad doit rester positive (pas de repères inversés).
        val area = quadArea(mapped)
        assertTrue(area > 0f)
    }

    private fun quadArea(pts: List<PointF>): Float {
        var sum = 0f
        for (i in pts.indices) {
            val p = pts[i]
            val q = pts[(i + 1) % pts.size]
            sum += p.x * q.y - q.x * p.y
        }
        return sum / 2f
    }

    private fun map(x: Float, y: Float): PointF =
        ScanGeometry.mapToFitView(
            points = listOf(PointF(x, y)),
            imageWidth = imageWidth,
            imageHeight = imageHeight,
            viewWidth = viewWidth,
            viewHeight = viewHeight,
        ).first()
}