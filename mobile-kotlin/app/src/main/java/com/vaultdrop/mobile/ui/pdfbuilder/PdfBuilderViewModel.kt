package com.vaultdrop.mobile.ui.pdfbuilder

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.preferences.DefaultRootStore
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFileInput
import com.vaultdrop.mobile.domain.GenerateId
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import javax.inject.Inject

/**
 * ViewModel de l'assemblage PDF : panier ordonné (fichiers + notes), génération
 * vers le cache puis sauvegarde (ACTION_CREATE_DOCUMENT) avec ré-import Room.
 *
 * L'URI créé est attaché au dossier SAF importé qui le contient (par préfixe de
 * documentId). Sinon il atterrit dans un dossier racine local « PDF générés ».
 * Dans les deux cas `FileRepository.saveLocalFile` déduplique par URI : un
 * rescan SAF ne crée jamais de doublon.
 */
@HiltViewModel
class PdfBuilderViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileRepository: FileRepository,
    private val folderRepository: FolderRepository,
    private val defaultRootStore: DefaultRootStore,
    private val generateId: GenerateId,
    private val engine: PdfBuilderEngine,
) : ViewModel() {

    private val _items = MutableStateFlow<List<PdfBuilderItem>>(emptyList())
    val items: StateFlow<List<PdfBuilderItem>> = _items.asStateFlow()

    private val _buildState = MutableStateFlow<BuildPhase>(BuildPhase.Idle)
    val buildState: StateFlow<BuildPhase> = _buildState.asStateFlow()

    private val _availableFiles = MutableStateFlow<List<FileEntity>>(emptyList())
    val availableFiles: StateFlow<List<FileEntity>> = _availableFiles.asStateFlow()

    init {
        viewModelScope.launch {
            fileRepository.observeAllVisible().collect { files ->
                _availableFiles.value = files
            }
        }
    }

    /** Charge la sélection initiale (ids des fichiers cochés sur les écrans de liste). */
    fun loadInitial(resourceIds: List<String>) {
        if (resourceIds.isEmpty()) return
        viewModelScope.launch {
            val loaded = resourceIds.mapNotNull { fileRepository.getFile(it) }
                .map { file ->
                    PdfBuilderItem.FileItem(file = file, failed = !file.isPdfBuilderSource())
                }
            _items.update { existing ->
                existing + loaded.filterNot { item ->
                    existing.any { existingItem -> existingItem.id == item.id }
                }
            }
        }
    }

    fun addFiles(resourceIds: List<String>) {
        if (resourceIds.isEmpty()) return
        viewModelScope.launch {
            val loaded = resourceIds.mapNotNull { fileRepository.getFile(it) }
                .map { file ->
                    PdfBuilderItem.FileItem(file = file, failed = !file.isPdfBuilderSource())
                }
            _items.update { existing ->
                existing + loaded.filterNot { item ->
                    existing.any { existingItem -> existingItem.id == item.id }
                }
            }
        }
    }

    fun addNote(body: String) {
        val clean = body.trim()
        if (clean.isEmpty()) return
        _items.update {
            it + PdfBuilderItem.NoteItem(
                id = generateId.newResourceId(),
                body = clean.take(MAX_NOTE_CHARS),
            )
        }
    }

    fun removeItem(id: String) {
        _items.update { list -> list.filterNot { it.id == id } }
    }

    fun moveUp(id: String) {
        _items.update { list ->
            val index = list.indexOfFirst { it.id == id }
            if (index <= 0) list
            else list.toMutableList().apply {
                add(index - 1, removeAt(index))
            }
        }
    }

    fun moveDown(id: String) {
        _items.update { list ->
            val index = list.indexOfFirst { it.id == id }
            if (index < 0 || index >= list.size - 1) list
            else list.toMutableList().apply {
                add(index + 1, removeAt(index))
            }
        }
    }

    /** Lance la génération vers un fichier cache ; émet les échecs sur les items. */
    fun generate() {
        val current = _buildState.value
        if (current is BuildPhase.Building) return
        if (_items.value.isEmpty()) {
            _buildState.value = BuildPhase.Failed(context.getString(R.string.pdf_builder_no_items))
            return
        }

        _buildState.value = BuildPhase.Building(0f)
        val snapshot = _items.value
        val cacheFile = File(context.cacheDir, "vaultdrop_build_${System.currentTimeMillis()}.pdf")
        viewModelScope.launch {
            runCatching {
                engine.buildPdf(
                    context = context,
                    items = snapshot,
                    outputFile = cacheFile,
                    onProgress = { p -> _buildState.value = BuildPhase.Building(p) },
                )
            }.onSuccess { result ->
                if (result.failedIds.isNotEmpty()) {
                    val failedSet = result.failedIds.toHashSet()
                    _items.update { list ->
                        list.map { item ->
                            if (item is PdfBuilderItem.FileItem && item.id in failedSet) {
                                item.copy(failed = true)
                            } else item
                        }
                    }
                }
                _buildState.value = BuildPhase.Ready(result.outputFile)
            }.onFailure { e ->
                Timber.e(e, "PDF build failed")
                cacheFile.delete()
                _buildState.value = BuildPhase.Failed(
                    context.getString(R.string.pdf_builder_error),
                )
            }
        }
    }

    /** Consomme un échec (le message a été affiché). */
    fun acknowledgeFailure() {
        if (_buildState.value is BuildPhase.Failed) _buildState.value = BuildPhase.Idle
    }

    /**
     * Écrit le cache directement dans la racine VaultDrop (DocumentsContract.
     * createDocument sur l'arbre) puis ré-importe le fichier dans Room.
     *
     * Le nom est obligatoire (Option C) : en vide, l'export est refusé.
     * `takePersistableUriPermission` est best-effort — l'insert Room ne dépend
     * jamais de cette permission.
     */
    fun saveAndImport(name: String) {
        val ready = _buildState.value as? BuildPhase.Ready ?: return
        val cacheFile = ready.file
        val trimmed = name.trim()
        if (trimmed.isBlank()) {
            _buildState.value = BuildPhase.Failed(
                context.getString(R.string.pdf_builder_name_required),
            )
            return
        }
        val rootResourceId = defaultRootStore.get()
        if (rootResourceId == null) {
            _buildState.value = BuildPhase.Failed(
                context.getString(R.string.pdf_builder_save_error),
            )
            return
        }
        viewModelScope.launch {
            runCatching {
                val root = folderRepository.getFolder(rootResourceId)
                    ?: error("default root not found: $rootResourceId")
                val rootUri = parentDocumentUri(root.uri)
                    ?: error("default root has no uri")

                val fileName = if (trimmed.lowercase().endsWith(".pdf")) trimmed else "$trimmed.pdf"
                val createdUri = DocumentsContract.createDocument(
                    context.contentResolver,
                    rootUri,
                    "application/pdf",
                    fileName,
                ) ?: error("cannot create document in default root")

                withContext(Dispatchers.IO) {
                    copyInto(createdUri, cacheFile, context.contentResolver)
                }

                val folderId = resolveTargetFolder(createdUri)
                val actualName = displayName(createdUri) ?: fileName
                val bytes = cacheFile.length()
                val inserted = fileRepository.saveLocalFile(
                    input = SaveFileInput(
                        uri = createdUri.toString(),
                        name = actualName,
                        extension = "pdf",
                        size = bytes,
                        mimeType = "application/pdf",
                        lastModified = System.currentTimeMillis(),
                        exists = true,
                        syncStatus = "local",
                    ),
                    folderResourceId = folderId,
                )
                cacheFile.delete()

                // Best-effort : prolonge l'accès au-delà de l'intent initial.
                runCatching {
                    context.contentResolver.takePersistableUriPermission(
                        createdUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                    )
                }.onFailure { Timber.w(it, "persistable uri permission absent") }

                inserted.resourceId
            }.onSuccess { resourceId ->
                _buildState.value = BuildPhase.Saved(resourceId)
            }.onFailure { e ->
                Timber.e(e, "PDF save failed")
                if (e is SecurityException) {
                    defaultRootStore.clear()
                    _buildState.value = BuildPhase.Failed(
                        context.getString(R.string.pdf_builder_save_error_permission),
                    )
                } else {
                    _buildState.value = BuildPhase.Failed(
                        e.message ?: context.getString(R.string.pdf_builder_save_error),
                    )
                }
            }
        }
    }

    // ------------------------------------------------------------ helpers

    /**
     * `DocumentsContract.createDocument` attend un URI *document*, pas un URI
     * *tree*. Convertit un tree URI en document URI (équivalent au dossier
     * racine de l'arbre) — les deux autorités sont identiques.
     */
    private fun parentDocumentUri(uri: String?): Uri? {
        val raw = uri?.let(Uri::parse) ?: return null
        return if (DocumentsContract.isTreeUri(raw)) {
            DocumentsContract.buildDocumentUriUsingTree(
                raw,
                DocumentsContract.getTreeDocumentId(raw),
            )
        } else {
            raw
        }
    }

    private fun copyInto(uri: Uri, source: File, resolver: ContentResolver) {
        val target = resolver.openOutputStream(uri)
            ?: error("cannot open output stream")
        target.use { out ->
            source.inputStream().use { input ->
                input.copyTo(out)
            }
        }
    }

    private fun displayName(uri: Uri): String? = runCatching {
        context.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull()

    /**
     * Associe l'URI créé au dossier (racine ou sous-dossier) dont le documentId
     * est le préfixe — plus long match gagne (ex. le sous-dossier « VaultDrop »
     * plutôt que l'arbre racine). Sinon dossier racine local « PDF générés ».
     */
    private suspend fun resolveTargetFolder(uri: Uri): String {
        val documentId = runCatching { DocumentsContract.getDocumentId(uri) }.getOrNull()
        if (documentId != null) {
            val matches = folderRepository.getAll()
                .filter { it.uri != null }
                .mapNotNull { folder ->
                    val treeDocId = runCatching {
                        DocumentsContract.getDocumentId(Uri.parse(folder.uri))
                    }.getOrNull()
                    if (treeDocId != null && documentId.startsWith("$treeDocId/")) {
                        folder to treeDocId.length
                    } else {
                        null
                    }
                }
            matches.maxByOrNull { it.second }?.first?.resourceId?.let { return it }
        }
        return generatedFolderResourceId()
    }

    private suspend fun generatedFolderResourceId(): String {
        val label = context.getString(R.string.pdf_generated_folder)
        folderRepository.getRootFolders()
            .firstOrNull { it.uri == null && it.name == label && it.parentResourceId == null }
            ?.let { return it.resourceId }
        return folderRepository.saveFolder(
            input = com.vaultdrop.mobile.data.repository.SaveFolderInput(
                uri = null,
                name = label,
                exists = true,
            ),
            parentResourceId = null,
        ).resourceId
    }

    companion object {
        private const val MAX_NOTE_CHARS = 100_000
    }
}

sealed interface BuildPhase {
    data object Idle : BuildPhase
    data class Building(val progress: Float) : BuildPhase
    data class Ready(val file: File) : BuildPhase
    data class Saved(val resourceId: String) : BuildPhase
    data class Failed(val message: String) : BuildPhase
}