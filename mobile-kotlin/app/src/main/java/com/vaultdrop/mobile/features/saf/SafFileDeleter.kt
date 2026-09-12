package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Suppression physique d'un fichier sur le device (mode review « supprimer »).
 *
 * Appelle `DocumentsContract.deleteDocument` sur l'uri SAF — le fichier
 * disparaît aussi de l'arborescence (et donc du prochain sync). En cas de
 * succès, la ligne Room est masquée (`exists = 0`) : cohérent avec la
 * réconciliation (jamais de DELETE SQL), idempotent face à la marche 30s.
 *
 * Retourne `false` si le provider refuse la suppression (permission ou pas de
 * geste delete) : dans ce cas le fichier reste dans la file de review.
 */
@Singleton
class SafFileDeleter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileRepository: FileRepository,
) {

    private val resolver: ContentResolver get() = context.contentResolver

    suspend fun delete(file: FileEntity): Boolean {
        val uri = file.uri ?: return false
        return withContext(Dispatchers.IO) {
            runCatching {
                DocumentsContract.deleteDocument(resolver, Uri.parse(uri))
            }.onSuccess { deleted ->
                if (deleted) {
                    Timber.d("deleted %s", uri)
                    fileRepository.markMissing(file.resourceId, System.currentTimeMillis())
                } else {
                    Timber.w("deleteDocument returned false for %s", uri)
                }
            }.onFailure { e ->
                Timber.w(e, "deleteDocument failed for %s", uri)
            }.getOrDefault(false)
        }
    }
}