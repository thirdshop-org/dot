package com.vaultdrop.mobile.data.repository

import com.vaultdrop.mobile.data.local.dao.FolderDao
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.local.entity.FolderStatus
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.FolderDto
import com.vaultdrop.mobile.domain.GenerateId
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Miroir de `services/db/repositories/folders.ts`. Local-first : l'UI lit Room
 * ; le réseau sert de source de rafraîchissement (snapshot cloud).
 */
@Singleton
class FolderRepository @Inject constructor(
    private val folderDao: FolderDao,
    private val apiClient: ApiClient,
    private val generateId: GenerateId,
) {

    fun observeRootFolders(): Flow<List<FolderEntity>> = folderDao.observeRootFolders()

    /** Sous-dossiers visibles d'un dossier (filtre `exists = 1` dans le DAO). */
    fun observeSubFolders(parentResourceId: String): Flow<List<FolderEntity>> =
        folderDao.observeByParent(parentResourceId)

    suspend fun getRootFolders(): List<FolderEntity> = folderDao.getRootFolders()

    suspend fun getFolder(resourceId: String): FolderEntity? =
        folderDao.getByResourceId(resourceId)

    /**
     * Fetch `GET /files/folders` et upsert dans Room. Les dossiers cloud
     * n'ont pas d'uri (uri = NULL → cloud-only). En V1 le serveur ne renvoie
     * que les racines.
     */
    suspend fun refreshFromServer() {
        val folders = apiClient.listFolders()
        if (folders.isEmpty()) return
        val now = System.currentTimeMillis()
        folderDao.upsertAll(folders.map { toEntity(it, now) })
    }

    private suspend fun toEntity(dto: FolderDto, now: Long): FolderEntity {
        val existing = folderDao.getByResourceId(dto.id)
        return FolderEntity(
            id = existing?.id ?: 0L,
            resourceId = dto.id,
            uri = null,
            name = dto.name,
            exists = null,
            parentResourceId = dto.parentId,
            ownerId = existing?.ownerId,
            syncStatus = existing?.syncStatus ?: FolderStatus.CLOUD,
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
    }

    /**
     * Upsert local d'un dossier physique (SAF) — établi par UX volontairement :
     * ajoute une ligne avec sa `uri` si absente, ou met à jour ses champs.
     */
    suspend fun saveFolder(
        input: SaveFolderInput,
        parentResourceId: String? = null,
    ): FolderEntity {
        val now = System.currentTimeMillis()
        val existing = input.resourceId?.let { folderDao.getByResourceId(it) }
            ?: input.uri?.let { folderDao.getByUri(it) }

        val entity = FolderEntity(
            id = existing?.id ?: 0L,
            resourceId = existing?.resourceId ?: input.resourceId ?: generateId.newResourceId(),
            uri = input.uri,
            name = input.name,
            exists = input.exists?.let { if (it) 1 else 0 },
            parentResourceId = existing?.parentResourceId ?: parentResourceId,
            ownerId = existing?.ownerId,
            syncStatus = existing?.syncStatus ?: FolderStatus.LOCAL,
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
        folderDao.upsert(entity)
        return entity
    }
}

data class SaveFolderInput(
    val uri: String?,
    val name: String,
    val exists: Boolean? = null,
    val resourceId: String? = null,
)