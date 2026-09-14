package com.vaultdrop.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vaultdrop.mobile.data.local.entity.FileEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface FileDao {

    @Query("SELECT * FROM files ORDER BY name ASC")
    suspend fun getAll(): List<FileEntity>

    @Query("SELECT * FROM files WHERE folder_resource_id = :folderResourceId AND \"exists\" = 1 ORDER BY name ASC")
    fun observeByFolder(folderResourceId: String): Flow<List<FileEntity>>

    @Query("SELECT * FROM files WHERE folder_resource_id = :folderResourceId AND \"exists\" = 1 ORDER BY name ASC")
    suspend fun getByFolderOnce(folderResourceId: String): List<FileEntity>

    @Query("SELECT * FROM files WHERE \"exists\" = 1 ORDER BY COALESCE(last_modified, added_at) DESC, name ASC")
    fun observeAllVisible(): Flow<List<FileEntity>>

    @Query("SELECT * FROM files WHERE resource_id = :resourceId LIMIT 1")
    suspend fun getByResourceId(resourceId: String): FileEntity?

    @Query("SELECT * FROM files WHERE uri = :uri LIMIT 1")
    suspend fun getByUri(uri: String): FileEntity?

    @Query("""
        SELECT * FROM files
        WHERE "exists" = 1
          AND (:query IS NULL OR name LIKE '%' || :query || '%')
          AND (:category IS NULL OR category = :category)
        ORDER BY name ASC
    """)
    fun searchWithFilters(query: String?, category: String?): Flow<List<FileEntity>>

    @Query("""
        SELECT * FROM files
        WHERE "exists" = 1
          AND (:category IS NULL OR category = :category)
        ORDER BY COALESCE(last_modified, added_at) DESC, name ASC
        LIMIT :limit
    """)
    fun recentFiles(category: String?, limit: Int): Flow<List<FileEntity>>

    @Upsert
    suspend fun upsert(file: FileEntity)

    @Query("UPDATE files SET \"exists\" = 0, updated_at = :updatedAt WHERE resource_id = :resourceId")
    suspend fun markMissing(resourceId: String, updatedAt: Long)

    /**
     * Promote le placement après confirmation serveur (`POST /sync/ops` appliqué) :
     * `local-cloud` si une copie physique existe, sinon `cloud`. Idempotent.
     */
    @Query("""
        UPDATE files
        SET sync_status = CASE WHEN uri IS NOT NULL THEN 'local-cloud' ELSE 'cloud' END,
            updated_at = :now
        WHERE resource_id = :resourceId
    """)
    suspend fun promoteSyncStatus(resourceId: String, now: Long)

    /**
     * Backfill : promu toutes les lignes restées `local` dont une op outbox
     * `create_resource`/`move_resource` a déjà été `synced` (poussées avant ce
     * mécanisme). Rattrape le pas pour les données préexistantes.
     */
    @Query("""
        UPDATE files
        SET sync_status = CASE WHEN uri IS NOT NULL THEN 'local-cloud' ELSE 'cloud' END,
            updated_at = :now
        WHERE sync_status = 'local'
          AND EXISTS (
              SELECT 1 FROM pending_operations
              WHERE pending_operations.resource_id = files.resource_id
                AND pending_operations.resource_type = 'file'
                AND pending_operations.status = 'synced'
                AND pending_operations.operation IN ('create_resource', 'move_resource')
          )
    """)
    suspend fun backfillSyncedStatus(now: Long)

    @Query("UPDATE files SET folder_resource_id = :folderId, updated_at = :updatedAt WHERE resource_id IN (:resourceIds)")
    suspend fun moveToFolder(resourceIds: List<String>, folderId: String, updatedAt: Long)

    @Query("UPDATE files SET uri = :uri WHERE resource_id = :resourceId")
    suspend fun updateUri(resourceId: String, uri: String?)

    @Query("DELETE FROM files WHERE resource_id = :resourceId")
    suspend fun remove(resourceId: String)

    @Query("SELECT COUNT(*) FROM files WHERE \"exists\" = 1 AND processed = 0 AND uri IS NOT NULL")
    fun observeUnprocessedCount(): Flow<Int>

    @Query("""
        SELECT * FROM files
        WHERE "exists" = 1
          AND processed = 0
          AND uri IS NOT NULL
        ORDER BY COALESCE(last_modified, added_at) DESC, name ASC
    """)
    fun observeUnprocessed(): Flow<List<FileEntity>>

    @Query("""
        SELECT * FROM files
        WHERE "exists" = 1
          AND processed = 0
          AND uri IS NOT NULL
        ORDER BY COALESCE(last_modified, added_at) DESC, name ASC
    """)
    suspend fun getUnprocessed(): List<FileEntity>

    @Query("UPDATE files SET processed = 1, updated_at = :updatedAt WHERE resource_id = :resourceId")
    suspend fun markProcessed(resourceId: String, updatedAt: Long)

    @Query("""
        UPDATE files
        SET processed = 1, updated_at = :updatedAt
        WHERE "exists" = 1 AND processed = 0 AND uri IS NOT NULL
    """)
    suspend fun markAllProcessed(updatedAt: Long)
}