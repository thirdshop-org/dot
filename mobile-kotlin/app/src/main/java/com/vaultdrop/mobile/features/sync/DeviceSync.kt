package com.vaultdrop.mobile.features.sync

import android.net.Uri
import androidx.room.withTransaction
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.OutboxRepository
import com.vaultdrop.mobile.data.repository.SaveFileInput
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import com.vaultdrop.mobile.domain.DeviceIdentity
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Synchronisation device↔SAF, miroir de `features/syncDevice.ts` (Expo).
 *
 * Deux phases par racine :
 *  - **Phase 1** — listing SAF via [SafScanner] sur `Dispatchers.IO`,
 *    HORS transaction : l'UI peut lire la DB pendant un parcours long ;
 *  - **Phase 2** — upserts Room dans une seule transaction courte (SQL pur),
 *    atomique : une interruption pendant le walk ne laisse aucun état partiel.
 *
 * Réconciliation : les lignes sous la racine avec une `uri` non revue sont
 * marquées `exists = 0` (jamais supprimées). Single-flight via [mutex] —
 * deux walks concurrents ne peuvent pas entrelacer leurs upserts.
 */
@Singleton
class DeviceSync @Inject constructor(
    private val appDatabase: AppDatabase,
    private val scanner: SafScanner,
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val outboxRepository: OutboxRepository,
    private val deviceIdentity: DeviceIdentity,
) {

    data class SyncResult(
        val rootUri: String,
        val folders: Int,
        val files: Int,
        val missing: Int,
    )

    private val mutex = Mutex()

    /** Marche d'une racine précise — à lancer après un `pickDirectory`. */
    suspend fun syncRoot(rootResourceId: String): SyncResult =
        mutex.withLock {
            val root = folderRepository.getFolder(rootResourceId)
                ?: error("unknown root folder: $rootResourceId")
            doSyncRoot(root)
        }

    /** Marche de toutes les racines (pour un futur rafraîchissement de fond). */
    suspend fun syncAll(): List<SyncResult> =
        mutex.withLock {
            folderRepository.getRootFolders()
                .filter { it.uri != null }
                .map { doSyncRoot(it) }
        }

    private suspend fun doSyncRoot(root: FolderEntity): SyncResult {
        val rootUri = checkNotNull(root.uri) { "root '${root.name}' has no physical uri" }
        val ownerId = deviceIdentity.getOrCreate()

        // Phase 1 — listing SAF (I/O disque, HORS transaction).
        val folders = scanner.scanTree(Uri.parse(rootUri))

        // Phase 2 — écritures Room (transaction courte, SQL pur).
        return appDatabase.withTransaction {
            val seen = HashSet<String>()
            val resourceIdByUri = HashMap<String, String>()
            var fileCount = 0

            for (folder in folders) {
                seen += folder.uri
                val parentResourceId =
                    if (folder.parentUri == null) null
                    else resourceIdByUri[folder.parentUri] ?: root.resourceId
                val saved = folderRepository.saveFolder(
                    SaveFolderInput(uri = folder.uri, name = folder.name, exists = true),
                    parentResourceId = parentResourceId,
                    ownerId = ownerId,
                )
                resourceIdByUri[folder.uri] = saved.resourceId
            }

            for (folder in folders) {
                val folderResourceId = resourceIdByUri[folder.uri] ?: root.resourceId
                for (file in folder.files) {
                    seen += file.uri
                    fileRepository.saveLocalFile(
                        input = SaveFileInput(
                            uri = file.uri,
                            name = file.name,
                            extension = file.name.extensionOrNull(),
                            size = file.size,
                            mimeType = file.mimeType,
                            lastModified = file.lastModified,
                        ),
                        folderResourceId = folderResourceId,
                        ownerId = ownerId,
                    )
                    fileCount++
                }
            }

            var missing = 0
            val now = System.currentTimeMillis()
            for (folder in folderRepository.getAll()) {
                val folderUri = folder.uri
                if (folder.exists != 0 && folderUri != null && isChildOf(folderUri, rootUri) && folderUri !in seen) {
                    folderRepository.markMissing(folder.resourceId, now)
                    missing++
                }
            }
            for (file in fileRepository.getAll()) {
                val fileUri = file.uri
                // Un `move_resource` (pending ou synced) fait de l'outbox la
                // source de vérité du placement : on ne masque jamais une ligne
                // en transition vers une autre arborescence physique (le
                // snapshot peut être périmé par rapport au move en cours).
                if (file.exists != 0 && fileUri != null && isChildOf(fileUri, rootUri) && fileUri !in seen &&
                    !outboxRepository.hasMoveOperation(file.resourceId)
                ) {
                    fileRepository.markMissing(file.resourceId, now)
                    missing++
                }
            }

            SyncResult(rootUri = rootUri, folders = folders.size, files = fileCount, missing = missing)
        }
    }

    private fun isChildOf(uri: String, rootUri: String): Boolean =
        uri == rootUri || uri.startsWith("$rootUri/")
}

private fun String.extensionOrNull(): String? {
    val dot = lastIndexOf('.')
    if (dot <= 0 || dot == length - 1) return null
    return substring(dot + 1)
}