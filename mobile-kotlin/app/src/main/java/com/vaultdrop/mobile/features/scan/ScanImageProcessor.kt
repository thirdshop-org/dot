package com.vaultdrop.mobile.features.scan

import android.graphics.Bitmap
import android.graphics.PointF
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import java.util.ArrayList
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Quadrilatère détecté (4 coins [TL, TR, BR, BL]) en pixels de l'image source. */
data class ScanQuad(val points: List<PointF>)

/** Modes de rendu du document numérisé. */
enum class ScanRenderMode { COLOR, GRAYSCALE, HIGH_CONTRAST }

/**
 * Pipeline de numérisation de document via OpenCV (AAR bundlé, hors GMS) :
 * détection des bords (Canny) + quad convexe (approxPolyDP) et redressement
 * perspective (`warpPerspective`) appliqué au moment du shutter seulement.
 *
 * La détection tourne sur une image réduite pour la performance ; le warp
 * s'applique sur l'image capturée en pleine résolution.
 */
@Singleton
class ScanImageProcessor @Inject constructor() {

    @Volatile
    private var loaded = false

    fun isAvailable(): Boolean {
        if (!loaded) {
            loaded = OpenCVLoader.initLocal()
        }
        return loaded
    }

    /**
     * Détecte le plus grand quad document dans l'image. Retourne les 4 coins
     * ordonnés dans les coordonnées de `bitmap` (NULL si aucun contour fiable).
     */
    fun detectCorners(bitmap: Bitmap): ScanQuad? {
        if (!isAvailable()) return null
        val maxSide = max(bitmap.width, bitmap.height)
        val scale = min(1f, MAX_DETECT_SIDE.toFloat() / maxSide)
        val frame = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * scale).roundToInt(),
                (bitmap.height * scale).roundToInt(),
                true,
            )
        } else {
            bitmap
        }
        val src = Mat()
        Utils.bitmapToMat(frame, src)
        val toRelease = ArrayList<Mat>()

        try {
            val gray = Mat()
            toRelease += gray
            Imgproc.cvtColor(src, gray, Imgproc.COLOR_RGBA2GRAY)
            val corners = findBestQuad(gray, frame.width, frame.height) ?: return null
            val ordered = CornerGeometry.orderPoints(corners.map { PointF(it.x.toFloat(), it.y.toFloat()) })
            return ScanQuad(ordered.map { PointF(it.x / scale, it.y / scale) })
        } finally {
            toRelease.add(src)
            toRelease.forEach { it.release() }
            if (scale < 1f) frame.recycle()
        }
    }

    /**
     * Redresse (`warpPerspective`) selon `quad` puis applique le mode de rendu.
     * Sortie plafonnée à [MAX_OUTPUT_SIDE] px sur le grand côté.
     */
    fun process(bitmap: Bitmap, quad: ScanQuad, mode: ScanRenderMode): Bitmap {
        if (!isAvailable()) return bitmap
        val (targetW, targetH) = CornerGeometry.outputSize(quad.points)
        val maxSide = max(targetW, targetH)
        val outScale = min(1f, MAX_OUTPUT_SIDE.toFloat() / maxSide)
        val outW = (targetW * outScale).roundToInt().coerceAtLeast(1)
        val outH = (targetH * outScale).roundToInt().coerceAtLeast(1)

        val src = Mat()
        Utils.bitmapToMat(bitmap, src)
        val toRelease = ArrayList<Mat>()

        try {
            val srcPts = MatOfPoint2f()
            srcPts.fromArray(*quad.points.map { Point(it.x.toDouble(), it.y.toDouble()) }.toTypedArray())
            toRelease += srcPts
            val dstPts = MatOfPoint2f(
                Point(0.0, 0.0),
                Point((outW - 1).toDouble(), 0.0),
                Point((outW - 1).toDouble(), (outH - 1).toDouble()),
                Point(0.0, (outH - 1).toDouble()),
            )
            toRelease += dstPts
            val transform = Imgproc.getPerspectiveTransform(srcPts, dstPts)
            toRelease += transform
            val warped = Mat()
            toRelease += warped
            Imgproc.warpPerspective(src, warped, transform, Size(outW.toDouble(), outH.toDouble()))

            val rendered = render(warped, mode, toRelease)
            val out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
            Utils.matToBitmap(rendered, out)
            return out
        } finally {
            toRelease.add(src)
            toRelease.forEach { it.release() }
        }
    }

    private fun findBestQuad(gray: Mat, width: Int, height: Int): List<Point>? {
        val blur = Mat()
        val edges = Mat()
        val hierarchy = Mat()
        val contours = ArrayList<MatOfPoint>()
        var best: List<Point>? = null
        var bestArea = 0.0

        try {
            Imgproc.GaussianBlur(gray, blur, Size(5.0, 5.0), 0.0)
            Imgproc.Canny(blur, edges, 75.0, 200.0)
            val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(3.0, 3.0))
            try {
                Imgproc.dilate(edges, edges, kernel)
            } finally {
                kernel.release()
            }
            Imgproc.findContours(edges, contours, hierarchy, Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)

            val minArea = width * height * MIN_RELATIVE_AREA
            for (c in contours) {
                val approx = MatOfPoint2f()
                try {
                    val c2f = MatOfPoint2f(*c.toArray())
                    try {
                        Imgproc.approxPolyDP(c2f, approx, APPROX_EPSILON * Imgproc.arcLength(c2f, true), true)
                    } finally {
                        c2f.release()
                    }
                    val pts = approx.toArray()
                    if (pts.size == 4) {
                        val convex = MatOfPoint(*pts)
                        try {
                            if (Imgproc.isContourConvex(convex)) {
                                val area = Imgproc.contourArea(convex)
                                if (area > minArea && area > bestArea) {
                                    bestArea = area
                                    best = pts.toList()
                                }
                            }
                        } finally {
                            convex.release()
                        }
                    }
                } finally {
                    approx.release()
                    c.release()
                }
            }
            return best
        } finally {
            blur.release()
            edges.release()
            hierarchy.release()
        }
    }

    private fun render(warped: Mat, mode: ScanRenderMode, toRelease: MutableList<Mat>): Mat {
        if (mode == ScanRenderMode.COLOR) return warped
        val gray = Mat()
        toRelease += gray
        Imgproc.cvtColor(warped, gray, Imgproc.COLOR_RGBA2GRAY)
        if (mode == ScanRenderMode.GRAYSCALE) return gray

        // HIGH_CONTRAST : CLAHE puis seuil adaptatif — rendu « scanner » net.
        val claheOut = Mat()
        toRelease += claheOut
        val clahe = Imgproc.createCLAHE(CLAHE_CLIP, Size(CLAHE_TILE, CLAHE_TILE))
        try {
            clahe.apply(gray, claheOut)
        } finally {
            clahe.clear()
        }
        val thresh = Mat()
        toRelease += thresh
        Imgproc.adaptiveThreshold(
            claheOut,
            thresh,
            255.0,
            Imgproc.ADAPTIVE_THRESH_GAUSSIAN_C,
            Imgproc.THRESH_BINARY,
            ADAPTIVE_BLOCK,
            ADAPTIVE_C,
        )
        return thresh
    }

    private companion object {
        const val MAX_DETECT_SIDE = 900
        const val MAX_OUTPUT_SIDE = 2400
        const val MIN_RELATIVE_AREA = 0.15f
        const val APPROX_EPSILON = 0.02f
        const val CLAHE_CLIP = 3.0
        const val CLAHE_TILE = 8.0
        const val ADAPTIVE_BLOCK = 15
        const val ADAPTIVE_C = 10.0
    }
}