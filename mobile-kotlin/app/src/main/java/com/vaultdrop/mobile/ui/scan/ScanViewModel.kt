package com.vaultdrop.mobile.ui.scan

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.PointF
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.ScanPageEntity
import com.vaultdrop.mobile.data.local.entity.ScanPageStatus
import com.vaultdrop.mobile.data.local.entity.ScanSessionEntity
import com.vaultdrop.mobile.data.preferences.DefaultRootStore
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFileInput
import com.vaultdrop.mobile.data.repository.ScanRepository
import com.vaultdrop.mobile.features.saf.SafUris
import com.vaultdrop.mobile.features.saf.SafWriter
import com.vaultdrop.mobile.features.scan.CornerGeometry
import com.vaultdrop.mobile.features.scan.ScanImageProcessor
import com.vaultdrop.mobile.features.scan.ScanQuad
import com.vaultdrop.mobile.features.scan.ScanRenderMode
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import kotlin.math.max
import kotlin.math.min

/** Étapes de l'écran de scan — état interne (une seule route `scan`). */
enum class ScanStage { CAMERA, CROP, SESSION }

/** Brouillon d'une capture en cours de recadrage (mémoire uniquement). */
data class PageDraft(
    val sourceFile: File,
    val bitmap: Bitmap,
    val quad: ScanQuad,
)

@HiltViewModel
class ScanViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val scanRepository: ScanRepository,
    private val fileRepository: FileRepository,
    private val folderRepository: FolderRepository,
    private val defaultRootStore: DefaultRootStore,
    private val imageProcessor: ScanImageProcessor,
) : ViewModel() {

    private val _session = MutableStateFlow<ScanSessionEntity?>(null)
    val session: StateFlow<ScanSessionEntity?> = _session.asStateFlow()

    private val _stage = MutableStateFlow(ScanStage.CAMERA)
    val stage: StateFlow<ScanStage> = _stage.asStateFlow()

    private val _draft = MutableStateFlow<PageDraft?>(null)
    val draft: StateFlow<PageDraft?> = _draft.asStateFlow()

    /** Dernière détection en direct (overlay du viewfinder). */
    private val _liveQuad = MutableStateFlow<ScanQuad?>(null)
    val liveQuad: StateFlow<ScanQuad?> = _liveQuad.asStateFlow()

    /** Dimensions (après rotation) de l'image analysée par le viewfinder — pour le mapping overlay. */
    private val _analysisImageSize = MutableStateFlow(0 to 0)
    val analysisImageSize: StateFlow<Pair<Int, Int>> = _analysisImageSize.asStateFlow()

    private val _renderMode = MutableStateFlow(ScanRenderMode.COLOR)
    val renderMode: StateFlow<ScanRenderMode> = _renderMode.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _exported = MutableStateFlow(false)
    val exported: StateFlow<Boolean> = _exported.asStateFlow()

    private val _pages = MutableStateFlow<List<ScanPageEntity>>(emptyList())
    val pages: StateFlow<List<ScanPageEntity>> = _pages.asStateFlow()

    /**
     * Scope de nettoyage indépendant du ViewModel : la suppression des fichiers
     * d'une session abandonnée est lancée puis on quitte l'écran, ce qui détruit
     * le ViewModel — `viewModelScope` serait annulé en plein nettoyage.
     */
    private val cleanupScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        viewModelScope.launch {
            val rootId = defaultRootStore.get()
            val session = scanRepository.getOrCreateActiveSession(rootId)
            _session.value = session
            combine(
                scanRepository.observePages(session.id),
                scanRepository.observePageCount(session.id),
            ) { pageList, _ -> pageList }
                .collect { _pages.value = it }
        }
    }

    fun onDetected(quad: ScanQuad?) {
        _liveQuad.value = quad
    }

    /** Exécuté sur le thread d'analyse : détection + publication pour l'overlay. */
    fun processAnalysisFrame(width: Int, height: Int, bitmap: Bitmap) {
        val quad = imageProcessor.detectCorners(bitmap)
        _analysisImageSize.value = width to height
        _liveQuad.value = quad
    }

    fun onCaptureError(message: String) {
        _message.value = message
    }

    /** Capture terminée : décode, redétecte sur l'image pleine, passe au crop. */
    fun onCapture(rawFile: File) {
        val currentSession = _session.value
        if (currentSession == null) {
            rawFile.delete()
            _message.value = context.getString(R.string.scan_error_session)
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            try {
                val bitmap = decodeSampled(rawFile)
                val detected = imageProcessor.detectCorners(bitmap)
                    ?: ScanQuad(defaultQuad(bitmap.width, bitmap.height))
                _draft.value = PageDraft(sourceFile = rawFile, bitmap = bitmap, quad = detected)
                _stage.value = ScanStage.CROP
            } catch (e: Exception) {
                Timber.e(e, "capture processing failed")
                rawFile.delete()
                _message.value = context.getString(R.string.scan_error_capture)
            } finally {
                _busy.value = false
            }
        }
    }

    fun updateQuad(quad: ScanQuad) {
        _draft.update { it?.copy(quad = quad) }
    }

    fun updateRenderMode(mode: ScanRenderMode) {
        _renderMode.value = mode
    }

    /** Valide la page recadrée : warp + rendu → JPEG final + persistance Room. */
    fun confirmPage() {
        val currentSession = _session.value ?: return
        val currentDraft = _draft.value ?: return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            try {
                val (targetW, targetH) = CornerGeometry.outputSize(currentDraft.quad.points)
                val processed = imageProcessor.process(
                    currentDraft.bitmap,
                    currentDraft.quad,
                    _renderMode.value,
                )
                val order = scanRepository.pageCount(currentSession.id) + 1
                val sessionDir = ensureSessionDir(currentSession.id)
                val finalFile = File(sessionDir, "page_$order.jpg")
                FileOutputStream(finalFile).use { out ->
                    processed.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
                }
                processed.recycle()
                currentDraft.sourceFile.delete()

                scanRepository.addPage(
                    session = currentSession,
                    tempUri = finalFile.absolutePath,
                    cornersJson = quadToString(currentDraft.quad),
                    width = targetW,
                    height = targetH,
                )
                _draft.value = null
                _stage.value = ScanStage.CAMERA
            } catch (e: Exception) {
                Timber.e(e, "confirm page failed")
                _message.value = context.getString(R.string.scan_error_page)
            } finally {
                _busy.value = false
            }
        }
    }

    /** Abandon du brouillon de capture (retour viewfinder). */
    fun retake() {
        _draft.value?.let { draft ->
            draft.sourceFile.delete()
        }
        _draft.value = null
        _stage.value = ScanStage.CAMERA
    }

    fun openSession() {
        _stage.value = ScanStage.SESSION
    }

    fun openCamera() {
        _stage.value = ScanStage.CAMERA
    }

    fun deletePage(page: ScanPageEntity) {
        val currentSession = _session.value ?: return
        viewModelScope.launch(Dispatchers.IO) {
            File(page.tempUri).delete()
            scanRepository.deletePage(page.id, currentSession.id)
        }
    }

    fun movePage(pageId: Long, delta: Int) {
        val currentSession = _session.value ?: return
        viewModelScope.launch {
            scanRepository.movePage(currentSession.id, _pages.value, pageId, delta)
        }
    }

    /** Exporte toutes les pages dans le dossier racine, 1 fichier = 1 outbox. */
    fun export() {
        val currentSession = _session.value ?: return
        viewModelScope.launch(Dispatchers.IO) {
            if (_busy.value) return@launch
            _busy.value = true
            try {
                val rootFolderId = currentSession.rootFolderId ?: defaultRootStore.get()
                    ?: error("no default root")
                val rootFolder = folderRepository.getFolder(rootFolderId)
                    ?: error("default root not found: $rootFolderId")
                val rootUri = SafUris.toDocumentUri(rootFolder.uri)
                    ?: error("default root has no uri")

                val pages = scanRepository.getPages(currentSession.id)
                val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
                pages.forEachIndexed { index, page ->
                    val file = File(page.tempUri)
                    if (!file.exists()) return@forEachIndexed
                    val displayName = "scan_${stamp}_${(index + 1).toString().padStart(2, '0')}.jpg"
                    val createdUri = SafWriter.createDocument(
                        resolver = context.contentResolver,
                        treeUri = rootUri.toString(),
                        mimeType = "image/jpeg",
                        displayName = displayName,
                    ) ?: error("cannot create document in default root")
                    SafWriter.copyInto(createdUri, file, context.contentResolver)
                    runCatching {
                        context.contentResolver.takePersistableUriPermission(
                            createdUri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                        )
                    }.onFailure { Timber.w(it, "persistable uri permission absent") }

                    val folderId = SafWriter.resolveTargetFolder(folderRepository, createdUri)
                        ?: rootFolderId
                    val name = SafWriter.displayName(context.contentResolver, createdUri)
                        ?: displayName
                    fileRepository.saveLocalFile(
                        input = SaveFileInput(
                            uri = createdUri.toString(),
                            name = name,
                            extension = "jpg",
                            size = file.length(),
                            mimeType = "image/jpeg",
                            lastModified = file.lastModified(),
                            exists = true,
                        ),
                        folderResourceId = folderId,
                    )
                    scanRepository.markPageExported(page.copy(status = ScanPageStatus.EXPORTED))
                }
                scanRepository.finishSession(currentSession.id)
                _exported.value = true
            } catch (e: Exception) {
                Timber.e(e, "scan export failed")
                _message.value = when (e) {
                    is SecurityException -> context.getString(R.string.pdf_builder_save_error_permission)
                    else -> context.getString(R.string.scan_error_export)
                }
            } finally {
                _busy.value = false
            }
        }
    }

    fun onExportedHandled() {
        _exported.value = false
    }

    /** Annule la session : suppression des fichiers temp + fermeture. */
    fun abandon() {
        val currentSession = _session.value ?: return
        cleanupScope.launch {
            scanRepository.getPages(currentSession.id).forEach { File(it.tempUri).delete() }
            sessionDir(currentSession.id)?.delete()
            _pages.value = emptyList()
            scanRepository.abandonSession(currentSession.id)
            _session.value = null
        }
    }

    fun dismissMessage() {
        _message.value = null
    }

    // ------------------------------------------------------------ helpers

    private fun ensureSessionDir(sessionId: Long): File =
        sessionDir(sessionId)?.apply { if (!exists()) mkdirs() } ?: sessionDir(sessionId)!!

    private fun sessionDir(sessionId: Long): File? = runCatching {
        File(context.filesDir, "$SCAN_DIR/$sessionId").also { it.mkdirs() }
    }.getOrNull()

    private fun defaultQuad(width: Int, height: Int): List<PointF> {
        val inset = min(width, height) * 0.08f
        return listOf(
            PointF(inset, inset),
            PointF(width - inset, inset),
            PointF(width - inset, height - inset),
            PointF(inset, height - inset),
        )
    }

    private fun decodeSampled(file: File): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > MAX_EDIT_SIDE) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeFile(file.absolutePath, options)
            ?: error("cannot decode capture")
        return applyExifOrientation(file, decoded)
    }

    /**
     * `BitmapFactory` ignore l'EXIF : une capture prise en portrait est stockée
     * en paysage (sens capteur), et l'image serait affichée/détectée à l'envers.
     * on la tourne donc selon `TAG_ORIENTATION` écrit par ImageCapture.
     */
    private fun applyExifOrientation(file: File, bitmap: Bitmap): Bitmap {
        val orientation = runCatching {
            android.media.ExifInterface(file.absolutePath)
                .getAttributeInt(
                    android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL,
                )
        }.getOrDefault(android.media.ExifInterface.ORIENTATION_NORMAL)
        val degrees = when (orientation) {
            android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
            android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
            android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }
        if (degrees == 0) return bitmap
        val matrix = Matrix().apply { setRotate(degrees.toFloat()) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }

    private fun quadToString(quad: ScanQuad): String =
        quad.points.joinToString(" ") { p -> "%.1f,%.1f".format(p.x, p.y) }

    private companion object {
        const val SCAN_DIR = "scan_sessions"
        const val MAX_EDIT_SIDE = 2400
        const val JPEG_QUALITY = 92
    }
}