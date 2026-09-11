package com.vaultdrop.mobile.data.repository

import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.FileDto
import com.vaultdrop.mobile.domain.GenerateId
import com.vaultdrop.mobile.domain.computeCategory
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
    private val generateId: GenerateId,
) {

    /** Fichiers visibles du dossier, locaux + cloud — source de l'UI. */
    fun observeFiles(folderResourceId: String): Flow<List<FileEntity>> =
        fileDao.observeByFolder(folderResourceId)

    /** Fichiers visibles de toute l'arborescence — écran d'accueil (grille par date). */
    fun observeAllVisible(): Flow<List<FileEntity>> = fileDao.observeAllVisible()

    /** Recherche/filtrage par nom et catégorie (utilisé par SearchViewModel). */
    fun searchFiles(query: String?, category: String?): Flow<List<FileEntity>> =
        fileDao.searchWithFilters(
            query = query?.trim()?.takeIf { it.isNotEmpty() },
            category = category,
        )

    /** Les `limit` fichiers les plus récemment ajoutés, filtrés par catégorie. */
    fun recentFiles(category: String?, limit: Int = RECENT_LIMIT): Flow<List<FileEntity>> =
        fileDao.recentFiles(category = category, limit = limit)

    suspend fun getFile(resourceId: String): FileEntity? =
        fileDao.getByResourceId(resourceId)

    suspend fun getAll(): List<FileEntity> = fileDao.getAll()

    /**
     * Upsert local d'un fichier SAF — miroir de `saveFile()` JS : déduplication
     * par `resource_id` ou `uri`, conservation de l'identité/sync_status/owner.
     */
    suspend fun saveLocalFile(
        input: SaveFileInput,
        folderResourceId: String,
        ownerId: String? = null,
    ): FileEntity {
        val now = System.currentTimeMillis()
        val existing = input.resourceId?.let { fileDao.getByResourceId(it) }
            ?: fileDao.getByUri(input.uri)

        val category = computeCategory(input.mimeType, input.extension).dbValue

        val entity = FileEntity(
            id = existing?.id ?: 0L,
            resourceId = existing?.resourceId ?: input.resourceId ?: generateId.newResourceId(),
            uri = input.uri,
            name = input.name,
            folderResourceId = folderResourceId,
            extension = input.extension ?: existing?.extension,
            size = input.size,
            mimeType = input.mimeType,
            category = category,
            exists = if (input.exists) 1 else 0,
            lastModified = input.lastModified,
            ownerId = ownerId ?: existing?.ownerId,
            syncStatus = existing?.syncStatus ?: input.syncStatus ?: FileStatus.LOCAL,
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
        fileDao.upsert(entity)
        return entity
    }

    /** Marque un fichier disparu de l'arborescence (`exists = 0`) — jamais supprimé. */
    suspend fun markMissing(resourceId: String, updatedAt: Long) =
        fileDao.markMissing(resourceId, updatedAt)

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
        val extension = dto.name.substringAfterLast('.', "")
            .takeIf { it.isNotEmpty() && it != dto.name }
        return FileEntity(
            id = existing?.id ?: 0L,
            resourceId = dto.id,
            uri = null,
            name = dto.name,
            folderResourceId = dto.folderId ?: folderResourceId,
            extension = extension,
            size = dto.size,
            mimeType = dto.mimeType,
            category = computeCategory(dto.mimeType, extension).dbValue,
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
        private const val RECENT_LIMIT = 5
    }
}

data class SaveFileInput(
    val uri: String,
    val name: String,
    val extension: String? = null,
    val size: Long,
    val mimeType: String? = null,
    val lastModified: Long? = null,
    val exists: Boolean = true,
    val resourceId: String? = null,
    /** Fallback de sync_status pour une nouvelle ligne (défaut local). */
    val syncStatus: String? = null,
)