package com.vaultdrop.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface FolderDao {

    @Query("SELECT * FROM folders ORDER BY name ASC")
    fun observeAll(): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders ORDER BY name ASC")
    suspend fun getAll(): List<FolderEntity>

    /** Dossiers créés dans l'app (`created_in_app = 1`) — cibles du picker de déplacement. */
    @Query("SELECT * FROM folders WHERE \"created_in_app\" = 1 ORDER BY name ASC")
    suspend fun getCreatedInApp(): List<FolderEntity>

    @Query("SELECT * FROM folders WHERE parent_resource_id IS NULL ORDER BY name ASC")
    fun observeRootFolders(): Flow<List<FolderEntity>>

    /** Racines physiques surveillées (uri SAF non nulle) — distinctes des racines cloud-only. */
    @Query("SELECT * FROM folders WHERE parent_resource_id IS NULL AND uri IS NOT NULL ORDER BY name ASC")
    fun observeSafRoots(): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders WHERE parent_resource_id IS NULL ORDER BY name ASC")
    suspend fun getRootFolders(): List<FolderEntity>

    @Query("SELECT * FROM folders WHERE parent_resource_id = :parentResourceId AND \"exists\" = 1 ORDER BY name ASC")
    fun observeByParent(parentResourceId: String): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders WHERE parent_resource_id = :parentResourceId ORDER BY name ASC")
    suspend fun getByParent(parentResourceId: String): List<FolderEntity>

    /** Snapshot des sous-dossiers visibles (filtre `exists = 1`) — opérations batch hors UI. */
    @Query("SELECT * FROM folders WHERE parent_resource_id = :parentResourceId AND \"exists\" = 1 ORDER BY name ASC")
    suspend fun getByParentOnce(parentResourceId: String): List<FolderEntity>

    @Query("SELECT * FROM folders WHERE resource_id = :resourceId LIMIT 1")
    suspend fun getByResourceId(resourceId: String): FolderEntity?

    @Query("SELECT * FROM folders WHERE uri = :uri LIMIT 1")
    suspend fun getByUri(uri: String): FolderEntity?

    @Upsert
    suspend fun upsert(folder: FolderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(folders: List<FolderEntity>)

    @Query("UPDATE folders SET \"exists\" = 0, updated_at = :updatedAt WHERE resource_id = :resourceId")
    suspend fun markMissing(resourceId: String, updatedAt: Long)

    /** Re-parente des sous-dossiers vers un nouveau parent (fusion). */
    @Query("UPDATE folders SET parent_resource_id = :newParentId, updated_at = :updatedAt WHERE resource_id IN (:resourceIds)")
    suspend fun reparent(resourceIds: List<String>, newParentId: String, updatedAt: Long)

    /**
     * Promote le placement après confirmation serveur (`POST /sync/ops` appliqué) :
     * `local-cloud` si une copie physique existe, sinon `cloud`. Idempotent.
     */
    @Query("""
        UPDATE folders
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
        UPDATE folders
        SET sync_status = CASE WHEN uri IS NOT NULL THEN 'local-cloud' ELSE 'cloud' END,
            updated_at = :now
        WHERE sync_status = 'local'
          AND EXISTS (
              SELECT 1 FROM pending_operations
              WHERE pending_operations.resource_id = folders.resource_id
                AND pending_operations.resource_type = 'folder'
                AND pending_operations.status = 'synced'
                AND pending_operations.operation IN ('create_resource', 'move_resource')
          )
    """)
    suspend fun backfillSyncedStatus(now: Long)

    @Query("DELETE FROM folders WHERE resource_id = :resourceId")
    suspend fun remove(resourceId: String)
}