package com.vaultdrop.mobile.features.scan

import android.graphics.PointF
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Géométrie pure-Kotlin du quadrilatère de scan (testable sans OpenCV) :
 * ordre des 4 coins, aire, dimensions du document redressé.
 */
object CornerGeometry {

    fun distance(a: PointF, b: PointF): Float =
        hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()).toFloat()

    /** Ordonne un quad convexe quelconque en [TL, TR, BR, BL]. */
    fun orderPoints(points: List<PointF>): List<PointF> {
        require(points.size == 4) { "quadrilateral required" }
        val tl = points.minByOrNull { it.x + it.y }!!
        val br = points.maxByOrNull { it.x + it.y }!!
        val tr = points.minByOrNull { it.y - it.x }!!
        val bl = points.maxByOrNull { it.y - it.x }!!
        return listOf(tl, tr, br, bl)
    }

    /** Aire du polygone (formule du lacet) — coins ordonnés ou non. */
    fun area(points: List<PointF>): Float {
        var sum = 0f
        for (i in points.indices) {
            val a = points[i]
            val b = points[(i + 1) % points.size]
            sum += a.x * b.y - b.x * a.y
        }
        return abs(sum) / 2f
    }

    /** Dimensions du document redressé (moyenne des côtés opposés). */
    fun outputSize(points: List<PointF>): Pair<Int, Int> {
        val (tl, tr, br, bl) = orderPoints(points)
        val w = max(distance(tl, tr), distance(bl, br))
        val h = max(distance(tl, bl), distance(tr, br))
        return w.roundToInt() to h.roundToInt()
    }
}