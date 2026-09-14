package com.vaultdrop.mobile.data.repository

import androidx.room.withTransaction
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.FileDto
import com.vaultdrop.mobile.domain.GenerateId
import com.vaultdrop.mobile.domain.SyncPlacement
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
 *
 * L'antichambre outbox (`create_resource`/`move_resource`) est écrite dans la
 * MÊME transaction que la mutation Room (pattern transactional outbox).
 */
@Singleton
class FileRepository @Inject constructor(
    private val fileDao: FileDao,
    private val apiClient: ApiClient,
    private val generateId: GenerateId,
    private val appDatabase: AppDatabase,
    private val outboxRepository: OutboxRepository,
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

    /** Les `limit` fichiers les plus récents (date de référence), filtrés par catégorie. */
    fun recentFiles(category: String?, limit: Int = RECENT_LIMIT): Flow<List<FileEntity>> =
        fileDao.recentFiles(category = category, limit = limit)

    /** Nombre de fichiers locaux non encore traités (file de review). */
    fun observeUnprocessedCount(): Flow<Int> = fileDao.observeUnprocessedCount()

    /** Fichiers locaux non traités, du plus récent au plus ancien — file de review. */
    fun observeUnprocessed(): Flow<List<FileEntity>> = fileDao.observeUnprocessed()

    /** Snapshot de la file de review, chargé à l'entrée dans le mode traitement. */
    suspend fun getUnprocessed(): List<FileEntity> = fileDao.getUnprocessed()

    /**
     * Marque un fichier comme traité (gardé) — déclenche aussi le push du
     * `create_resource` vers l'outbox, dans la même transaction (gate
     * « processed » : un fichier n'est synchronisé que lorsqu'il est gardé).
     * Idempotent : un `create_resource` déjà enqueue (ou synced) interdit un
     * doublon.
     */
    suspend fun markProcessed(resourceId: String) {
        val now = System.currentTimeMillis()
        appDatabase.withTransaction {
            val file = fileDao.getByResourceId(resourceId) ?: return@withTransaction
            fileDao.markProcessed(resourceId, now)
            if (file.exists == 1 && file.uri != null && !outboxRepository.hasCreateOperation(resourceId)) {
                outboxRepository.enqueueCreateResource(
                    resourceId = file.resourceId,
                    resourceType = "file",
                    name = file.name,
                    parentResourceId = file.folderResourceId,
                    mimeType = file.mimeType,
                    extension = file.extension,
                )
            }
        }
    }

    /**
     * Échappatoire : marque tous les fichiers locaux restants comme traités ET
     * synchronisés (un `create_resource` par fichier, dans la même transaction).
     */
    suspend fun markAllProcessed() {
        val now = System.currentTimeMillis()
        appDatabase.withTransaction {
            val files = fileDao.getUnprocessed()
            if (files.isEmpty()) return@withTransaction
            for (file in files) {
                fileDao.markProcessed(file.resourceId, now)
                if (!outboxRepository.hasCreateOperation(file.resourceId)) {
                    outboxRepository.enqueueCreateResource(
                        resourceId = file.resourceId,
                        resourceType = "file",
                        name = file.name,
                        parentResourceId = file.folderResourceId,
                        mimeType = file.mimeType,
                        extension = file.extension,
                    )
                }
            }
        }
    }

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

        // Un `move_resource` encore en attente fait de la cible outbox la
        // source de vérité du placement : un snapshot SAF périmé (walk lancé
        // avant le move) ne doit pas ré-attribuer le dossier à l'ancien parent.
        val movePending = existing != null && outboxRepository.hasPendingMoveOperation(existing.resourceId)
        val effectiveFolder = if (movePending) existing.folderResourceId else folderResourceId

        val entity = FileEntity(
            id = existing?.id ?: 0L,
            resourceId = existing?.resourceId ?: input.resourceId ?: generateId.newResourceId(),
            uri = input.uri,
            name = input.name,
            folderResourceId = effectiveFolder,
            extension = input.extension ?: existing?.extension,
            size = input.size,
            mimeType = input.mimeType,
            category = category,
            exists = if (input.exists) 1 else 0,
            lastModified = input.lastModified,
            ownerId = ownerId ?: existing?.ownerId,
            syncStatus = existing?.syncStatus ?: input.syncStatus ?: FileStatus.LOCAL,
            // Une ligne existante liée reste à son état ; une nouvelle ligne est
            // « traitée » si la source l'a demandé (ex. scan), sinon à traiter.
            processed = existing?.processed ?: input.processed,
            addedAt = existing?.addedAt ?: now,
            updatedAt = now,
        )
        appDatabase.withTransaction {
            fileDao.upsert(entity)
            if (existing == null && entity.processed) {
                // Nouveau fichier physique déjà « traité » (ex. scan export) :
                // poussé immédiatement. Un fichier SAF tout juste découvert
                // reste `processed = false` → local-only, il n'est poussé qu'au
                // « garder » de la review (`markProcessed`).
                outboxRepository.enqueueCreateResource(
                    resourceId = entity.resourceId,
                    resourceType = "file",
                    name = entity.name,
                    parentResourceId = entity.folderResourceId,
                    mimeType = entity.mimeType,
                    extension = entity.extension,
                )
            }
        }
        return entity
    }

    /** Marque un fichier disparu de l'arborescence (`exists = 0`) — jamais supprimé. */
    suspend fun markMissing(resourceId: String, updatedAt: Long) =
        fileDao.markMissing(resourceId, updatedAt)

    /** Met à jour la cible dossier d'un fichier (déplacement local / cloud-only). */
    suspend fun applyMove(resourceId: String, folderId: String, newUri: String?) {
        val now = System.currentTimeMillis()
        appDatabase.withTransaction {
            fileDao.moveToFolder(listOf(resourceId), folderId, now)
            if (newUri != null) fileDao.updateUri(resourceId, newUri)
            // Déplacement reflété localement ←→ poussé vers le serveur.
            outboxRepository.enqueueMoveResource(
                resourceId = resourceId,
                resourceType = "file",
                toFolderResourceId = folderId,
            )
        }
    }

    /**
     * `GET /files?folderId=...` (1re page, tri serveur) puis upsert cloud de
     * chaque fichier. Ne supprime jamais de lignes locales.
     *
     * Garde-fou outbox : un fichier dont le `move_resource` n'a pas encore été
     * poussé garde son placement local. Le serveur renvoie encore l'ancien
     * dossier tant que l'op est pendante — écraser la ligne la ferait disparaître
     * du dossier cible (et réapparaître dans l'ancien).
     */
    suspend fun refreshFromServer(folderResourceId: String) {
        val files = apiClient.listFiles(folderId = folderResourceId, pageSize = PAGE_SIZE)
        if (files.isEmpty()) return
        val now = System.currentTimeMillis()
        files.forEach { dto ->
            if (outboxRepository.hasPendingMoveOperation(dto.id)) {
                // L'antichambre outbox fait foi tant que le move n'est pas synced.
                return@forEach
            }
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
            uri = existing?.uri,
            name = dto.name,
            folderResourceId = dto.folderId ?: folderResourceId,
            extension = extension,
            size = dto.size,
            mimeType = dto.mimeType,
            category = computeCategory(dto.mimeType, extension).dbValue,
            exists = 1,
            lastModified = existing?.lastModified,
            ownerId = existing?.ownerId,
            // Le snapshot serveur confirme la présence cloud : si une copie
            // physique existe aussi, placement local-cloud (jamais d'écrasement
            // de l'uri / de régression du placement).
            syncStatus = SyncPlacement.confirmed(existing?.uri != null),
            processed = existing?.processed ?: false,
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
    /** Le fichier arrive déjà « traité » (ex. scan) ou à traiter dans la review. */
    val processed: Boolean = false,
)