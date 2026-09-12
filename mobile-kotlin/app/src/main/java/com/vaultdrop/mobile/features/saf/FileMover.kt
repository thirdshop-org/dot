package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Déplacement de fichiers (multi-select) entre dossiers.
 *
 *  - fichier physique (uri ≠ null) + dossier cible physique → relocation SAF
 *    réelle via `DocumentsContract.moveDocument` (l'arborescence locale reste
 *    cohérente avec Room) ; en cas d'échec (permission/edge provider), repli
 *    bas de gamme : métadonnée seule (`folderResourceId`), la marche suivante
 *    re-réconciliera.
 *  - fichier cloud-only → mise à jour de la métadonnée de dossier uniquement
 *    (pas de poussée serveur en V1 — pas d'outbox).
 */
@Singleton
class FileMover @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileRepository: FileRepository,
    private val folderRepository: FolderRepository,
) {

    private val resolver: ContentResolver get() = context.contentResolver

    suspend fun moveFiles(resourceIds: List<String>, targetFolderId: String) {
        val target = folderRepository.getFolder(targetFolderId)
            ?: throw IllegalArgumentException("unknown target folder: $targetFolderId")
        val targetDoc = SafUris.toDocumentUri(target.uri)

        // I/O ContentResolver (DocumentsContract) hors du thread main.
        withContext(Dispatchers.IO) {
            for (resourceId in resourceIds) {
                val file = fileRepository.getFile(resourceId) ?: continue
                val physicalTarget = file.uri != null && targetDoc != null

                val newUri = if (physicalTarget) {
                    tryMove(file.uri, file.folderResourceId, targetDoc)
                } else {
                    null
                }
                fileRepository.applyMove(resourceId, targetFolderId, newUri ?: file.uri)
            }
        }
    }

    /**
     * Tente la relocation SAF. Retourne le nouvel uri du document (peut être
     * identique à l'ancien), ou null en échec → repli métadonnée seule.
     */
    private suspend fun tryMove(fileUri: String?, sourceFolderId: String, targetDoc: Uri): String? {
        if (fileUri == null) return null
        val sourceFolder = folderRepository.getFolder(sourceFolderId)
        val sourceDoc = SafUris.toDocumentUri(sourceFolder?.uri)
        if (sourceDoc == null) return null
        return runCatching {
            DocumentsContract.moveDocument(
                resolver,
                Uri.parse(fileUri),
                sourceDoc,
                targetDoc,
            )
        }.onSuccess { moved -> Timber.d("moved %s -> %s (%s)", fileUri, targetDoc, moved) }
            .onFailure { Timber.w(it, "physical move failed for %s (metadata-only)", fileUri) }
            .getOrNull()?.toString()
    }
}