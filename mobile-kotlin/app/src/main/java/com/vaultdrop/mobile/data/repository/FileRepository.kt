package com.vaultdrop.mobile.data.repository

import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.FileDto
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Miroir de `services/db/repositories/files.ts`. Local-first : l'UI observe
 * Room ; le réseau rafraîchit les fichiers cloud d'un dossier (`GET /files`).
 *
 * Les fichiers renvoyés par le serveur sont cloud-only (uri = NULL) :
 * aucune copie physique locale, mirror de `saveFile(..., syncStatus='cloud')`.
 */
@Singleton
class FileRepository @Inject constructor(
    private val fileDao: FileDao,
    private val apiClient: ApiClient,
) {

    /** Fichiers visibles du dossier, locaux + cloud — source de l'UI. */
    fun observeFiles(folderResourceId: String): Flow<List<FileEntity>> =
        fileDao.observeByFolder(folderResourceId)

    suspend fun getFile(resourceId: String): FileEntity? =
        fileDao.getByResourceId(resourceId)

    /**
     * `GET /files?folderId=...` (1re page, tri serveur) puis upsert cloud de
     * chaque fichier. Ne supprime jamais de lignes locales.
     */
    suspend fun refreshFromServer(folderResourceId: String) {
        val files = apiClient.listFiles(folderId = folderResourceId, pageSize = PAGE_SIZE)
        if (files.isEmpty()) return
        val now = System.currentTimeMillis()
        files.forEach { dto ->
            fileDao.upsert(toEntity(dto, folderResourceId, now))
        }
    }

    private suspend fun toEntity(dto: FileDto, folderResourceId: String, now: Long): FileEntity {
        val existing = fileDao.getByResourceId(dto.id)
        return FileEntity(
            id = existing?.id ?: 0L,
            resourceId = dto.id,
            uri = null,
            name = dto.name,
            folderResourceId = dto.folderId ?: folderResourceId,
            extension = dto.name.substringAfterLast('.', "").takeIf { it.isNotEmpty() && it != dto.name },
            size = dto.size,
            mimeType = dto.mimeType,
            exists = 1,
            lastModified = existing?.lastModified,
            ownerId = existing?.ownerId,
            syncStatus = existing?.syncStatus ?: FileStatus.CLOUD,
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
    }

    companion object {
        private const val PAGE_SIZE = 50
    }
}