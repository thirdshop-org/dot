package com.vaultdrop.mobile.ui.scan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.PointF
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Étape « viewfinder » : Preview CameraX + analyse continue pour l'overlay du
 * document détecté, bouton de capture (full-res JPEG → [ScanViewModel.onCapture]).
 *
 * Liaison/déliaison CameraX une seule fois par entrée dans l'étape
 * (DisposableEffect) ; l'analyse tourne sur un executor dédié et est coupée au
 * dispose pour ne pas consummer la batterie quand on croppe.
 */
@Composable
fun CameraStage(
    viewModel: ScanViewModel,
    pageCount: Int,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val analysisSize by viewModel.analysisImageSize.collectAsStateWithLifecycle()
    val liveQuad by viewModel.liveQuad.collectAsStateWithLifecycle()

    var viewSize by remember { mutableStateOf(IntSize(0, 0)) }
    var overlayQuad by remember { mutableStateOf<List<PointF>?>(null) }

    LaunchedEffect(liveQuad, analysisSize, viewSize) {
        val quad = liveQuad ?: return@LaunchedEffect
        val (iw, ih) = analysisSize
        if (iw <= 0 || ih <= 0 || viewSize.width <= 0 || viewSize.height <= 0) return@LaunchedEffect
        overlayQuad = ScanGeometry.mapToVisibleView(quad.points, iw, ih, viewSize.width, viewSize.height)
    }

    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    val imageCapture = remember {
        ImageCapture.Builder()
            .setTargetResolution(Size(1920, 1080))
            .build()
    }

    Box(modifier = modifier) {
        AndroidView(
            factory = { ctx ->
                PreviewView(ctx).apply {
                    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                }.also { view ->
                    view.addOnLayoutChangeListener { v, left, top, right, bottom, _, _, _, _ ->
                        viewSize = IntSize(right - left, bottom - top)
                    }
                }
            },
            update = { previewView = it },
            modifier = Modifier.fillMaxSize(),
        )

        val quad = overlayQuad
        if (quad != null && quad.size == 4) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val path = Path().apply {
                    moveTo(quad[0].x, quad[0].y)
                    quad.drop(1).forEach { lineTo(it.x, it.y) }
                    close()
                }
                drawPath(path = path, color = Color.White, style = Stroke(width = 4.dp.toPx()))
                quad.forEach { point ->
                    drawCircle(
                        color = Color.White,
                        radius = 7.dp.toPx(),
                        center = Offset(point.x, point.y),
                        style = Stroke(width = 3.dp.toPx()),
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (pageCount > 0) {
                OutlinedButton(onClick = viewModel::openSession) {
                    Text(stringResource(R.string.scan_pages_count, pageCount))
                }
            }
            FloatingActionButton(
                onClick = { capture(context, imageCapture, viewModel) },
                modifier = Modifier.padding(top = 16.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.CameraAlt,
                    contentDescription = stringResource(R.string.scan_capture),
                )
            }
        }
    }

    DisposableEffect(lifecycleOwner, previewView) {
        val pv = previewView ?: return@DisposableEffect onDispose {}
        val executor = ContextCompat.getMainExecutor(context)
        val analysisExecutor = Executors.newSingleThreadExecutor()
        val providerFuture = ProcessCameraProvider.getInstance(context)
        val disposed = java.util.concurrent.atomic.AtomicBoolean(false)
        val bindingListener = Runnable {
            if (disposed.get()) return@Runnable
            val provider = providerFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(pv.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(analysisExecutor) { proxy ->
                try {
                    val unrotated = proxy.toBitmap()
                    val degrees = proxy.imageInfo.rotationDegrees
                    val bitmap = if (degrees != 0) rotate(unrotated, degrees) else unrotated
                    try {
                        viewModel.processAnalysisFrame(bitmap.width, bitmap.height, bitmap)
                    } finally {
                        if (bitmap !== unrotated) unrotated.recycle()
                        bitmap.recycle()
                    }
                } catch (_: Exception) {
                    // Une frame illisible ne doit pas stopper l'analyse.
                } finally {
                    proxy.close()
                }
            }
            provider.unbindAll()
            provider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis,
                imageCapture,
            )
        }
        providerFuture.addListener(bindingListener, executor)
        onDispose {
            disposed.set(true)
            analysisExecutor.shutdown()
            runCatching { providerFuture.get().unbindAll() }
        }
    }
}

private fun rotate(bitmap: Bitmap, degrees: Int): Bitmap {
    val matrix = Matrix().apply {
        when (degrees) {
            90 -> setRotate(90f)
            180 -> setRotate(180f)
            270 -> setRotate(270f)
        }
    }
    return bitmap.run {
        Bitmap.createBitmap(this, 0, 0, width, height, matrix, true)
    }
}

private fun capture(context: Context, imageCapture: ImageCapture, viewModel: ScanViewModel) {
    val file = File(context.cacheDir, "scan_capture_${System.currentTimeMillis()}.jpg")
    imageCapture.takePicture(
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    // toBitmap() renvoie les pixels dans le sens capteur :
                    // on tourne explicitement avec rotationDegrees (comme le
                    // viewfinder) pour obtenir un fichier « à l'endroit »,
                    // indépendamment de l'EXIF que ImageCapture n'écrit pas
                    // de façon fiable.
                    val raw = image.toBitmap()
                    val degrees = image.imageInfo.rotationDegrees
                    val rotated = if (degrees != 0) rotate(raw, degrees) else raw
                    if (rotated !== raw) raw.recycle()
                    FileOutputStream(file).use { out ->
                        rotated.compress(Bitmap.CompressFormat.JPEG, SCAN_JPEG_QUALITY, out)
                    }
                    rotated.recycle()
                    viewModel.onCapture(file)
                } catch (e: Exception) {
                    file.delete()
                    viewModel.onCaptureError(context.getString(R.string.scan_error_capture))
                } finally {
                    image.close()
                }
            }

            override fun onError(exception: ImageCaptureException) {
                file.delete()
                viewModel.onCaptureError(context.getString(R.string.scan_error_capture))
            }
        },
    )
}

private const val SCAN_JPEG_QUALITY = 92