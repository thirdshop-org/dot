package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Crée un dossier physique via DocumentsContract (SAF) — facteur commun de
 * `ensureVaultDropFolder` (onboarding) et de la feature « Créer un dossier ».
 *
 * Le parent peut être un URI *tree* (racine importée) ou *document* (dossier
 * déjà créé/parcouru) : les deux sont acceptés par `createDocument`.
 */
@Singleton
class SafFolderCreator @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val resolver: ContentResolver get() = context.contentResolver

    /**
     * Crée un sous-dossier nommé `name` sous `parentUri`. Retourne son URI SAF,
     * ou null si le parent est absente ou si la création échoue.
     */
    suspend fun createFolder(parentUri: String?, name: String): Uri? {
        val parentDocumentUri = toDocumentUri(parentUri) ?: return null
        val created = runCatching {
            DocumentsContract.createDocument(
                resolver,
                parentDocumentUri,
                DocumentsContract.Document.MIME_TYPE_DIR,
                name,
            )
        }.getOrElse { e ->
            Timber.w(e, "cannot create folder '$name' in $parentUri")
            null
        } ?: return null

        // Best-effort : prolonge l'accès au-delà de l'intent original.
        runCatching {
            resolver.takePersistableUriPermission(
                created,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }.onFailure { Timber.w(it, "persistable uri permission absent for new folder") }

        return created
    }

    /**
     * `DocumentsContract.createDocument` attend un URI *document*, pas un URI
     * *tree*. Convertit un tree URI en document URI (équivalent au dossier
     * racine de l'arbre) — les deux autorités sont identiques.
     */
    private fun toDocumentUri(uri: String?): Uri? {
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
}