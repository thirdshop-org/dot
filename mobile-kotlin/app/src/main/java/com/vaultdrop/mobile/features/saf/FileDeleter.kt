package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.room.withTransaction
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.OutboxRepository
import com.vaultdrop.mobile.features.thumbnails.ThumbnailStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Suppression de fichiers en mode multi-sélection.
 *
 * Trois modes :
 * - **LOCALLY** : supprime le fichier physique SAF + marque `exists = 0` en Room,
 *   sans journaliser dans l\'outbox (le serveur n\'est pas affecté).
 * - **IN_CLOUD** : enqueue `delete_resource` dans l\'outbox uniquement, sans
 *   toucher au fichier local.
 * - **FULL** : les deux — suppression physique + outbox `delete_resource`.
 */
@Singleton
class FileDeleter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileRepository: FileRepository,
    private val outboxRepository: OutboxRepository,
    private val appDatabase: AppDatabase,
    private val thumbnailStore: ThumbnailStore,
) {

    private val resolver: ContentResolver get() = context.contentResolver

    enum class DeleteMode { LOCALLY, IN_CLOUD, FULL }

    data class DeleteReport(val succeeded: Int, val failed: Int)

    suspend fun deleteFiles(files: List<FileEntity>, mode: DeleteMode): DeleteReport {
        var succeeded = 0
        var failed = 0
        withContext(Dispatchers.IO) {
            for (file in files) {
                val ok = when (mode) {
                    DeleteMode.LOCALLY -> deleteLocally(file)
                    DeleteMode.IN_CLOUD -> deleteInCloud(file)
                    DeleteMode.FULL -> deleteFull(file)
                }
                if (ok) succeeded++ else failed++
            }
        }
        return DeleteReport(succeeded, failed)
    }

    /**
     * Suppression physique locale uniquement (SAF + Room).
     * Pas d\'outbox : le serveur n\'est pas notifié.
     */
    private suspend fun deleteLocally(file: FileEntity): Boolean {
        val uri = file.uri ?: return false
        return runCatching {
            DocumentsContract.deleteDocument(resolver, Uri.parse(uri))
        }.onSuccess { deleted ->
            if (deleted) {
                fileRepository.markMissing(file.resourceId, System.currentTimeMillis())
                thumbnailStore.delete(file.resourceId)
                Timber.d("deleted locally %s", uri)
            } else {
                Timber.w("deleteDocument returned false for %s", uri)
            }
        }.onFailure { e ->
            Timber.w(e, "deleteDocument failed for %s", uri)
        }.getOrDefault(false)
    }

    /**
     * Suppression cloud uniquement (outbox `delete_resource`).
     * Le fichier local n\'est pas touché. N\'a de sens que si la ressource a
     * déjà été poussée (gate « processed » : un fichier jamais envoyé est no-op).
     */
    private suspend fun deleteInCloud(file: FileEntity): Boolean {
        var ok = false
        runCatching {
            if (outboxRepository.hasCreateOperation(file.resourceId)) {
                outboxRepository.enqueueDeleteResource(file.resourceId, "file")
            }
            ok = true
            Timber.d("enqueued cloud delete for %s", file.resourceId)
        }.onFailure { e ->
            Timber.w(e, "enqueueDeleteResource failed for %s", file.resourceId)
        }
        return ok
    }

    /**
     * Suppression complète : physique + cloud.
     * Transaction atomique : SAF delete + markMissing + outbox.
     */
    private suspend fun deleteFull(file: FileEntity): Boolean {
        val uri = file.uri
        return if (uri != null) {
            runCatching {
                DocumentsContract.deleteDocument(resolver, Uri.parse(uri))
            }.onSuccess { deleted ->
                if (deleted) {
                    val now = System.currentTimeMillis()
                    appDatabase.withTransaction {
                        fileRepository.markMissing(file.resourceId, now)
                        if (outboxRepository.hasCreateOperation(file.resourceId)) {
                            outboxRepository.enqueueDeleteResource(file.resourceId, "file")
                        }
                    }
                    Timber.d("deleted full %s", uri)
                    thumbnailStore.delete(file.resourceId)
                } else {
                    Timber.w("deleteDocument returned false for %s", uri)
                }
            }.onFailure { e ->
                Timber.w(e, "deleteDocument failed for %s", uri)
            }.getOrDefault(false)
        } else {
            // Cloud-only : outbox uniquement.
            deleteInCloud(file)
        }
    }
}
