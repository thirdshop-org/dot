package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.vaultdrop.mobile.data.repository.FolderRepository
import java.io.File

/**
 * Écriture de fichiers créés par l'app (PDF builder, scans) dans l'arborescence
 * SAF importée — jamais MediaStore ni permission externe.
 */
object SafWriter {

    /**
     * Crée un document dans le dossier racine d'un arbre SAF. `treeUri` est
     * l'URI *tree* telle que stockée (`folders.uri`) ; convertie en URI
     * *document* avant `createDocument`.
     */
    fun createDocument(
        resolver: ContentResolver,
        treeUri: String,
        mimeType: String,
        displayName: String,
    ): Uri? {
        val documentUri = SafUris.toDocumentUri(treeUri) ?: return null
        return DocumentsContract.createDocument(resolver, documentUri, mimeType, displayName)
    }

    fun copyInto(uri: Uri, source: File, resolver: ContentResolver) {
        val target = resolver.openOutputStream(uri) ?: error("cannot open output stream")
        target.use { out ->
            source.inputStream().use { input ->
                input.copyTo(out)
            }
        }
    }

    fun displayName(resolver: ContentResolver, uri: Uri): String? = runCatching {
        resolver.query(
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
     * est le préfixe — plus long match gagne. Largest match; null si aucun dossier
     * connu ne contient l'URI (préfixe de treeId).
     */
    suspend fun resolveTargetFolder(folderRepository: FolderRepository, uri: Uri): String? {
        val documentId = runCatching { DocumentsContract.getDocumentId(uri) }.getOrNull()
            ?: return null
        return folderRepository.getAll()
            .filter { it.uri != null }
            .mapNotNull { folder ->
                val treeDocId = runCatching {
                    DocumentsContract.getDocumentId(Uri.parse(folder.uri))
                }.getOrNull()
                if (treeDocId != null && documentId.startsWith("$treeDocId/")) {
                    folder.resourceId to treeDocId.length
                } else {
                    null
                }
            }
            .maxByOrNull { it.second }
            ?.first
    }
}