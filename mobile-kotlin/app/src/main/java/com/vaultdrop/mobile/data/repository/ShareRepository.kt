package com.vaultdrop.mobile.data.repository

import androidx.room.withTransaction
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.dao.FolderDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.ResourcePermissionDto
import com.vaultdrop.mobile.domain.DeviceIdentity
import com.vaultdrop.mobile.domain.SyncPlacement
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Hydratation des ressources partagées dans Room depuis le snapshot serveur.
 *
 * Le snapshot (`GET /sync/permissions`) contient les permissions effectives
 * de l'utilisateur. Les ressources non possédées (viewer/commenter/editor)
 * sont importées en tant que lignes cloud-only (`uri = NULL`, `sync_status = "cloud"`).
 *
 * Un pull complet (`after=0`) est effectué au login et à la restauration de
 * session pour garantir la convergence (révocations = disparition du snapshot).
 */
@Singleton
class ShareRepository @Inject constructor(
    private val apiClient: ApiClient,
    private val appDatabase: AppDatabase,
    private val deviceIdentity: DeviceIdentity,
) {

    /**
     * Récupère le snapshot complet des permissions et hydrate Room.
     *
     * Pour chaque permission non-owner :
     *  - Folders : upsert cloud-only (uri=null, name, parentId, ownerId)
     *  - Files : upsert cloud-only (uri=null, name, folderResourceId, ownerId, processed=true)
     *
     * Convergence : les lignes cloud-only absentes du snapshot complet sont
     * marquées `exists = 0`.
     */
    suspend fun syncSnapshot() {
        val currentUserId = deviceIdentity.getOrCreate()
        val permissions = apiClient.syncPermissions()

        val now = System.currentTimeMillis()
        val folderDao = appDatabase.folderDao()
        val fileDao = appDatabase.fileDao()

        val snapshotFolderIds = mutableSetOf<String>()
        val snapshotFileIds = mutableSetOf<String>()

        appDatabase.withTransaction {
            for (perm in permissions) {
                when {
                    perm.effectiveAccess == "owner" -> Unit
                    perm.resourceType == "folder" -> {
                        snapshotFolderIds += perm.resourceId
                        upsertSharedFolder(perm, now, folderDao)
                    }
                    perm.resourceType == "file" -> {
                        snapshotFileIds += perm.resourceId
                        upsertSharedFile(perm, now, fileDao)
                    }
                }
            }

            // Convergence : marquer les lignes cloud-only absentes du snapshot
            // comme disparues (révocation / expiration côté serveur).
            for (folder in folderDao.getAll()) {
                if (isCloudOnlyForOtherUser(folder.uri, folder.ownerId, currentUserId, folder.exists)
                    && folder.resourceId !in snapshotFolderIds
                ) {
                    folderDao.markMissing(folder.resourceId, now)
                }
            }
            for (file in fileDao.getAll()) {
                if (isCloudOnlyForOtherUser(file.uri, file.ownerId, currentUserId, file.exists)
                    && file.resourceId !in snapshotFileIds
                ) {
                    fileDao.markMissing(file.resourceId, now)
                }
            }
        }

        Timber.d(
            "syncSnapshot: hydrated %d folders, %d files",
            snapshotFolderIds.size,
            snapshotFileIds.size,
        )
    }

    /**
     * Ligne hébergée cloud (uri NULL), non possédée localement, encore visible.
     * Absente du snapshot → ressource partagée révoquée/expirée → marquer disparue.
     */
    private fun isCloudOnlyForOtherUser(
        uri: String?,
        ownerId: String?,
        currentNodeId: String,
        exists: Int?,
    ): Boolean = uri == null && ownerId != null && ownerId != currentNodeId && exists != 0

    private suspend fun upsertSharedFolder(
        perm: ResourcePermissionDto,
        now: Long,
        folderDao: FolderDao,
    ) {
        val existing = folderDao.getByResourceId(perm.resourceId)
        if (existing != null && existing.uri != null) {
            // Une copie physique locale existe déjà — ne jamais écraser l'uri.
            return
        }
        val entity = FolderEntity(
            id = existing?.id ?: 0L,
            resourceId = perm.resourceId,
            uri = null,
            name = perm.name.ifBlank { existing?.name ?: "" },
            exists = 1,
            parentResourceId = perm.parentId ?: existing?.parentResourceId,
            ownerId = perm.ownerId ?: existing?.ownerId,
            syncStatus = SyncPlacement.confirmed(false),
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
        folderDao.upsert(entity)
    }

    private suspend fun upsertSharedFile(
        perm: ResourcePermissionDto,
        now: Long,
        fileDao: FileDao,
    ) {
        val existing = fileDao.getByResourceId(perm.resourceId)
        if (existing != null && existing.uri != null) {
            // Une copie physique locale existe déjà — ne jamais écraser l'uri.
            return
        }
        val entity = FileEntity(
            id = existing?.id ?: 0L,
            resourceId = perm.resourceId,
            uri = null,
            name = perm.name.ifBlank { existing?.name ?: "" },
            folderResourceId = perm.parentId ?: existing?.folderResourceId ?: "",
            extension = existing?.extension,
            size = existing?.size ?: 0L,
            mimeType = existing?.mimeType,
            category = existing?.category,
            exists = 1,
            lastModified = existing?.lastModified,
            ownerId = perm.ownerId ?: existing?.ownerId,
            syncStatus = SyncPlacement.confirmed(false),
            processed = true,
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
        fileDao.upsert(entity)
    }
}