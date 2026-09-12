package com.vaultdrop.mobile.ui.document.content

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Contenu pincable : zoom (et pan) par geste de deux doigts.
 *
 * Le geste est détecté à la main (plutôt que `detectTransformGestures`) pour
 * ne consommer les événements que lorsqu'il y a une vraie manipulation : tant
 * que `scale == 1` et qu'aucun pinch n'est amorcé, rien n'est consommé, donc
 * les gestes parents (swipe de page, tap-pour-quitter) restent fonctionnels.
 * Dès qu'un pinch est détecté ou que le contenu est zoomé, les événements sont
 * consommés (le zoom/pan pilote alors la zone, et le swipe de page est bloqué).
 *
 * Le zoom est ancré au centroïde des doigts, le pan est borné pour que le
 * contenu ne sorte jamais de la zone. Au relâchement, un zoom < 1 rebondit
 * vers 1 et un offset hors limites est recentré (animation ressort).
 */
@Composable
fun ZoomableContent(
    modifier: Modifier = Modifier,
    onScaleChanged: ((Float) -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()

    fun clampX(value: Float): Float {
        if (scale <= 1f || viewport.width == 0) return 0f
        val max = (scale - 1f) * viewport.width / 2f
        return value.coerceIn(-max, max)
    }

    fun clampY(value: Float): Float {
        if (scale <= 1f || viewport.height == 0) return 0f
        val max = (scale - 1f) * viewport.height / 2f
        return value.coerceIn(-max, max)
    }

    Box(
        modifier = modifier
            .onSizeChanged { viewport = it }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offsetX
                translationY = offsetY
                transformOrigin = TransformOrigin(0f, 0f)
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var pinching = false
                    while (true) {
                        val event = awaitPointerEvent()
                        if (!event.changes.any { it.pressed }) break
                        // Un parent (pager, tap…) a déjà pris le geste : on ne touche à rien.
                        if (event.changes.any { it.isConsumed }) continue

                        val zoom = event.calculateZoom()
                        val pan = event.calculatePan()
                        val currentScale = scale
                        if (!pinching &&
                            abs(zoom - 1f) > ZOOM_DELTA &&
                            event.changes.count { it.pressed } >= 2
                        ) {
                            pinching = true
                        }

                        if (pinching || currentScale > 1f) {
                            val centroid = event.calculateCentroid()
                            val nextScale = (currentScale * zoom).coerceIn(MIN_ZOOM, MAX_ZOOM)
                            val delta = currentScale - nextScale
                            offsetX = clampX(offsetX + delta * centroid.x + pan.x)
                            offsetY = clampY(offsetY + delta * centroid.y + pan.y)
                            scale = nextScale
                            onScaleChanged?.invoke(nextScale)
                            event.changes.forEach { if (!it.isConsumed) it.consume() }
                        }
                    }

                    // Fin du geste : rebond vers 1 si zoom < 1, sinon recentrage.
                    if (scale < 1f) {
                        scope.launch {
                            val anim = Animatable(scale)
                            anim.animateTo(1f, spring())
                            scale = anim.value
                        }
                        scope.launch {
                            val animX = Animatable(offsetX)
                            animX.animateTo(0f, spring())
                            offsetX = animX.value
                        }
                        scope.launch {
                            val animY = Animatable(offsetY)
                            animY.animateTo(0f, spring())
                            offsetY = animY.value
                        }
                    } else {
                        val targetX = clampX(offsetX)
                        val targetY = clampY(offsetY)
                        if (targetX != offsetX || targetY != offsetY) {
                            scope.launch {
                                val animX = Animatable(offsetX)
                                animX.animateTo(targetX, spring())
                                offsetX = animX.value
                            }
                            scope.launch {
                                val animY = Animatable(offsetY)
                                animY.animateTo(targetY, spring())
                                offsetY = animY.value
                            }
                        }
                    }
                }
            },
    ) {
        content()
    }
}

private const val MAX_ZOOM = 4f

private const val MIN_ZOOM = 0.8f

private const val ZOOM_DELTA = 0.01f