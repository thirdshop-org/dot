package com.vaultdrop.mobile.ui.scan

import android.graphics.PointF
import android.graphics.RectF
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.features.scan.ScanQuad
import com.vaultdrop.mobile.features.scan.ScanRenderMode
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Mode d'interaction pendant le drag du quad de recadrage. */
private sealed interface Interaction {
    data object None : Interaction
    data object Move : Interaction
    data class Corner(val index: Int) : Interaction
}

/**
 * Étape « recadrage » : affiche la capture zoomée sur la zone détectée (marge
 * incluse) avec le quad superposé.
 *
 * Interactions :
 * - glisser un coin (poignée) pour le déplacer ;
 * - glisser à l'intérieur du quad pour déplacer la zone entière ;
 * - si aucune zone n'a été détectée à la capture, un cadre par défaut est
 *   proposé avec ses 4 points libres.
 *
 * La validation lance le warp full-res via [ScanViewModel.confirmPage].
 */
@Composable
fun CropStage(
    viewModel: ScanViewModel,
    modifier: Modifier = Modifier,
) {
    val draft by viewModel.draft.collectAsStateWithLifecycle()
    val pageDraft = draft ?: return
    val renderMode by viewModel.renderMode.collectAsStateWithLifecycle()

    val bitmap = remember(pageDraft.bitmap) { pageDraft.bitmap }
    val imageWidth = bitmap.width
    val imageHeight = bitmap.height

    var boxSize by remember { mutableStateOf(IntSize.Zero) }
    var interaction by remember { mutableStateOf<Interaction>(Interaction.None) }
    var moveStart by remember { mutableStateOf<MoveStart?>(null) }
    val currentQuad = rememberUpdatedState(pageDraft.quad)
    val touchRadiusPx = with(LocalDensity.current) { 28.dp.toPx() }

    // Zoom initial : bounding box du quad détecté + marge, figé à l'entrée du
    // crop (les gestes modifient le quad sans ré-zoomer derrière le doigt).
    val viewport = remember(imageWidth, imageHeight, pageDraft.bitmap) {
        initialViewport(pageDraft.quad, imageWidth, imageHeight)
    }

    fun clampToImage(p: PointF) =
        PointF(
            p.x.coerceIn(0f, imageWidth.toFloat()),
            p.y.coerceIn(0f, imageHeight.toFloat()),
        )

    // Le bitmap du brouillon est dessiné par ce Canvas pendant toute la durée
    // du crop. On ne le recycle pas dans le ViewModel (confirmPage/retake) :
    // `recycle()` y provoquerait une course entre le thread IO et le draw
    // Compose courant (`Canvas: trying to use a recycled bitmap` sur le device).
    // Il est libéré quand CropStage quitte la composition — après que plus
    // aucune frame ne peut le dessiner.
    DisposableEffect(pageDraft.bitmap) {
        onDispose { pageDraft.bitmap.recycle() }
    }

    Column(
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .onSizeChanged { boxSize = IntSize(it.width, it.height) }
                .pointerInput(viewport, boxSize) {
                    fun screenToImage(pos: Offset): PointF =
                        ScanGeometry.mapViewToRect(
                            PointF(pos.x, pos.y),
                            viewport,
                            boxSize.width,
                            boxSize.height,
                        )

                    detectDragGestures(
                        onDragStart = { offset ->
                            val screenPts = ScanGeometry.mapPointsToView(
                                currentQuad.value.points,
                                viewport,
                                boxSize.width,
                                boxSize.height,
                            )
                            interaction = hitTest(offset, screenPts, touchRadiusPx)
                            if (interaction is Interaction.Move) {
                                moveStart = MoveStart(currentQuad.value.points, screenToImage(offset))
                            } else {
                                moveStart = null
                            }
                        },
                        onDragEnd = {
                            interaction = Interaction.None
                            moveStart = null
                        },
                        onDragCancel = {
                            interaction = Interaction.None
                            moveStart = null
                        },
                        onDrag = { change, _ ->
                            val current = interaction
                            when (current) {
                                is Interaction.None -> Unit
                                is Interaction.Corner -> {
                                    change.consume()
                                    val img = clampToImage(screenToImage(change.position))
                                    val pts = currentQuad.value.points.toMutableList()
                                    pts[current.index] = img
                                    viewModel.updateQuad(ScanQuad(pts))
                                }
                                is Interaction.Move -> {
                                    moveStart?.let { start ->
                                        change.consume()
                                        val img = clampToImage(screenToImage(change.position))
                                        val dx = img.x - start.imagePoint.x
                                        val dy = img.y - start.imagePoint.y
                                        viewModel.updateQuad(
                                            ScanQuad(
                                                start.quadAtStart.map { p ->
                                                    clampToImage(PointF(p.x + dx, p.y + dy))
                                                },
                                            ),
                                        )
                                    }
                                }
                            }
                        },
                    )
                },
        ) {
            val quadScreen = remember(currentQuad.value, viewport, boxSize) {
                ScanGeometry.mapPointsToView(
                    currentQuad.value.points,
                    viewport,
                    boxSize.width,
                    boxSize.height,
                )
            }

            Canvas(modifier = Modifier.fillMaxSize()) {
                val dst = ScanGeometry.viewportFit(viewport, boxSize.width, boxSize.height)
                drawImage(
                    image = bitmap.asImageBitmap(),
                    srcOffset = IntOffset(viewport.left.roundToInt(), viewport.top.roundToInt()),
                    srcSize = IntSize(viewport.width().roundToInt(), viewport.height().roundToInt()),
                    dstOffset = IntOffset(dst.left.roundToInt(), dst.top.roundToInt()),
                    dstSize = IntSize(dst.width().roundToInt(), dst.height().roundToInt()),
                )

                if (quadScreen.size == 4) {
                    val path = Path().apply {
                        moveTo(quadScreen[0].x, quadScreen[0].y)
                        quadScreen.drop(1).forEach { lineTo(it.x, it.y) }
                        close()
                    }
                    drawPath(
                        path = path,
                        color = Color.White,
                        style = Stroke(width = 4.dp.toPx()),
                    )
                    quadScreen.forEach { point ->
                        drawCircle(
                            color = Color.White,
                            radius = HANDLE_RADIUS_DP.dp.toPx(),
                            center = Offset(point.x, point.y),
                            style = Stroke(width = 6.dp.toPx()),
                        )
                        drawCircle(
                            color = HANDLE_COLOR,
                            radius = HANDLE_RADIUS_DP.dp.toPx(),
                            center = Offset(point.x, point.y),
                        )
                    }
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ScanRenderMode.entries.forEach { mode ->
                FilterChip(
                    selected = renderMode == mode,
                    onClick = { viewModel.updateRenderMode(mode) },
                    label = { Text(renderModeLabel(mode)) },
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = viewModel::retake) {
                Text(stringResource(R.string.scan_retake))
            }
            Button(onClick = viewModel::confirmPage) {
                Text(stringResource(R.string.scan_confirm_page))
            }
        }
    }
}

/** Snapshot pour « déplacer le quad entier » : points au départ + point image. */
private data class MoveStart(val quadAtStart: List<PointF>, val imagePoint: PointF)

/** Bounding box du quad + marge, clampée aux bornes de l'image. */
private fun initialViewport(quad: ScanQuad, imageWidth: Int, imageHeight: Int): RectF {
    var minX = Float.MAX_VALUE
    var minY = Float.MAX_VALUE
    var maxX = -Float.MAX_VALUE
    var maxY = -Float.MAX_VALUE
    quad.points.forEach { p ->
        minX = minOf(minX, p.x)
        minY = minOf(minY, p.y)
        maxX = maxOf(maxX, p.x)
        maxY = maxOf(maxY, p.y)
    }
    val w = (maxX - minX).coerceAtLeast(1f)
    val h = (maxY - minY).coerceAtLeast(1f)
    val padX = w * VIEWPORT_MARGIN
    val padY = h * VIEWPORT_MARGIN
    return RectF(
        (minX - padX).coerceIn(0f, imageWidth.toFloat()),
        (minY - padY).coerceIn(0f, imageHeight.toFloat()),
        (maxX + padX).coerceIn(0f, imageWidth.toFloat()),
        (maxY + padY).coerceIn(0f, imageHeight.toFloat()),
    )
}

private fun hitTest(offset: Offset, quadScreen: List<PointF>, touchRadiusPx: Float): Interaction {
    if (quadScreen.size != 4) return Interaction.None
    quadScreen.forEachIndexed { index, point ->
        if (hypot(offset.x - point.x, offset.y - point.y) <= touchRadiusPx) {
            return Interaction.Corner(index)
        }
    }
    return if (pointInQuad(offset, quadScreen)) Interaction.Move else Interaction.None
}

/** Test point-dans-polygone convexe (coins ordonnés [TL, TR, BR, BL]). */
private fun pointInQuad(point: Offset, quad: List<PointF>): Boolean {
    if (quad.size != 4) return false
    var sign = 0f
    for (i in 0 until 4) {
        val a = quad[i]
        val b = quad[(i + 1) % 4]
        val cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
        if (cross == 0f) continue
        val s = if (cross > 0f) 1f else -1f
        if (sign == 0f) sign = s
        else if (s != sign) return false
    }
    return true
}

@Composable
private fun renderModeLabel(mode: ScanRenderMode): String = when (mode) {
    ScanRenderMode.COLOR -> stringResource(R.string.scan_render_color)
    ScanRenderMode.GRAYSCALE -> stringResource(R.string.scan_render_gray)
    ScanRenderMode.HIGH_CONTRAST -> stringResource(R.string.scan_render_high)
}

private val HANDLE_COLOR = Color(0xFF1E88E5)
private const val VIEWPORT_MARGIN = 0.08f
private const val HANDLE_RADIUS_DP = 12f