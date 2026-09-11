package com.vaultdrop.mobile.features.sync

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import javax.inject.Inject
import javax.inject.Singleton

/** Métadonnée d'un fichier SAF — jamais son contenu. */
data class FileNode(
    val uri: String,
    val name: String,
    val size: Long,
    val mimeType: String?,
    val lastModified: Long?,
)

/** Métadonnée d'un dossier SAF, avec ses fichiers directs. */
data class FolderNode(
    val uri: String,
    val name: String,
    /** uri du dossier parent (null pour la racine) — calculé au DFS, pas de `dirname()`. */
    val parentUri: String?,
    val files: List<FileNode>,
)

/**
 * Parcours récursif SAF, conçu pour ne pas exploser les ressources ni bloquer :
 *
 *  - **itératif** (pile explicite) : aucune récursion JVM, aucune limite de
 *    profondeur — une arborescence profonde ne fait pas déborder la pile ;
 *  - **`Dispatchers.IO`** pour toute l'I/O ContentResolver : l'UI ne bloque
 *    jamais pendant l'exploration ;
 *  - **coopératif et annulable** : `yield()` tous les `YIELD_EVERY` dossiers et
 *    `ensureActive()` à chaque étape (si le ViewModel est détruit, on s'arrête) ;
 *  - **une seule requête ContentResolver par dossier**, métadonnées uniquement
 *    (aucun chargement de contenu en mémoire).
 */
@Singleton
class SafScanner @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val resolver: ContentResolver get() = context.contentResolver

    /** Marche la racine `treeUri` ; renvoie tous les dossiers en ordre préfixe (DFS). */
    suspend fun scanTree(treeUri: Uri): List<FolderNode> = withContext(Dispatchers.IO) {
        val rootDocId = DocumentsContract.getTreeDocumentId(treeUri)
        val root = ScanFolder(
            uri = treeUri.toString(),
            docId = rootDocId,
            name = rootName(treeUri, rootDocId),
            parentUri = null,
        )

        val all = ArrayList<FolderNode>()
        val stack = ArrayDeque<ScanFolder>()
        val visited = HashSet<String>() // anti-cycle : un provider pathologique ne doit jamais boucler
        var processed = 0

        stack.addLast(root)
        while (stack.isNotEmpty()) {
            ensureActive()
            if (++processed % YIELD_EVERY == 0) yield()

            val folder = stack.removeLast()
            if (!visited.add(folder.docId)) continue

            val contents = listDir(treeUri, folder.docId)
            folder.files += contents.files
            all += FolderNode(folder.uri, folder.name, folder.parentUri, folder.files)

            // push en ordre inverse : le premier enfant listé est dépilé en premier
            // → ordre préfixe (un dossier précède toujours ses descendants).
            for (i in contents.folders.indices.reversed()) {
                val child = contents.folders[i]
                stack.addLast(
                    ScanFolder(
                        uri = child.uri,
                        docId = child.docId,
                        name = child.name,
                        parentUri = folder.uri,
                    ),
                )
            }
        }
        all
    }

    private class ScanFolder(
        val uri: String,
        val docId: String,
        val name: String,
        val parentUri: String?,
        val files: MutableList<FileNode> = mutableListOf(),
    )

    private class ChildDir(val docId: String, val uri: String, val name: String)
    private class DirContents(val folders: List<ChildDir>, val files: List<FileNode>)

    /** Liste le contenu direct d'un dossier (fils + fichiers), en une requête. */
    private fun listDir(treeUri: Uri, dirDocId: String): DirContents {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, dirDocId)
        val folders = ArrayList<ChildDir>()
        val files = ArrayList<FileNode>()

        resolver.query(
            childrenUri,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            ),
            null,
            null,
            "${DocumentsContract.Document.COLUMN_DISPLAY_NAME} ASC",
        )?.use { cursor ->
            val iDoc = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val iName = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val iMime = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
            val iSize = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
            val iLast = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

            while (cursor.moveToNext()) {
                val docId = cursor.getString(iDoc)
                if (docId == dirDocId) continue // certains providers renvoient le dossier lui-même
                val name = if (iName >= 0) cursor.getString(iName)
                    else docId.substringAfterLast('/')
                val mime = if (iMime >= 0) cursor.getString(iMime) else null

                if (name.startsWith(".")) continue

                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId).toString()
                    folders += ChildDir(docId, uri, name)
                } else {
                    val size = if (iSize >= 0 && !cursor.isNull(iSize)) cursor.getLong(iSize) else 0L
                    if (size == 0L) continue
                    if (KNOWN_NOISE_EXTENSIONS.any { name.endsWith(it, ignoreCase = true) }) continue

                    val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId).toString()
                    files += FileNode(
                        uri = uri,
                        name = name,
                        size = size,
                        mimeType = mime,
                        lastModified = if (iLast >= 0 && !cursor.isNull(iLast)) cursor.getLong(iLast) else null,
                    )
                }
            }
        }
        return DirContents(folders, files)
    }

    /** Nom du dossier racine — DISPLAY_NAME du nœud racine du tree SAF. */
    private fun rootName(treeUri: Uri, rootDocId: String): String {
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootDocId)
        return runCatching {
            resolver.query(
                docUri,
                arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getString(0) else null
            }
        }.getOrNull() ?: rootDocId.substringAfter(':').substringAfterLast('/')
    }

    private companion object {
        /** Nombre de dossiers visités entre deux `yield()` (coopération inter-coroutines). */
        const val YIELD_EVERY = 64

        /** Extensions de bruit système / OS / téléchargements incomplets à ignorer. */
        val KNOWN_NOISE_EXTENSIONS = setOf(
            ".tmp", ".log", ".bak", ".dat", ".db", ".db-wal", ".db-shm",
            ".nomedia", ".thumbnails",
            ".apk", ".dex", ".odex",
            ".part", ".crdownload",
            ".DS_Store",
        )
    }
}