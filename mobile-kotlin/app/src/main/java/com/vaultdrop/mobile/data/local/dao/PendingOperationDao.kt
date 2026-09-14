package com.vaultdrop.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingOperationDao {

    /** Prochaines opérations à pousser, strictement par ordre de création. */
    @Query("SELECT * FROM pending_operations WHERE status = 'pending' ORDER BY id ASC LIMIT :limit")
    suspend fun selectPending(limit: Int): List<PendingOperationEntity>

    /** Dernières opérations (tous statuts), pour l'affichage UI « liste des sync ». */
    @Query("SELECT * FROM pending_operations ORDER BY id DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<PendingOperationEntity>>

    /** Nombre d'ops encore en attente de push (indicateur du header). */
    @Query("SELECT COUNT(*) FROM pending_operations WHERE status = 'pending'")
    fun observePendingCount(): Flow<Int>

    @Insert
    suspend fun insert(op: PendingOperationEntity): Long

    @Query("UPDATE pending_operations SET status = 'synced', updated_at = :now WHERE id = :id")
    suspend fun markSynced(id: Long, now: Long)

    /** Échec avec bump du compteur de tentatives (dead-letter après MAX_PENDING_ATTEMPTS). */
    @Query("UPDATE pending_operations SET status = 'failed', attempts = attempts + 1, updated_at = :now WHERE id = :id")
    suspend fun markFailed(id: Long, now: Long)

    /**
     * Invalidation en cascade : un `create_resource` définitivement échoué rend
     * fautives toutes les ops en attente qui ciblent la même ressource (filles).
     */
    @Query("UPDATE pending_operations SET status = 'failed', updated_at = :now WHERE resource_id = :resourceId AND status = 'pending'")
    suspend fun failDescendants(resourceId: String, now: Long)

    /** Rétention : purge des ops synchronisées plus anciennes que `cutoff`. */
    @Query("DELETE FROM pending_operations WHERE status = 'synced' AND updated_at < :cutoff")
    suspend fun purgeSynced(cutoff: Long)

    /**
     * Une op `create_resource` (pending ou synced) existe-t-elle déjà pour ce
     * fichier ? Le gate « processed » enqueue le create au moment du review —
     * ce garde-fou évite de le re-enqueue (re-keep, purge > 7j, etc.).
     */
    @Query("""
        SELECT COUNT(*) FROM pending_operations
        WHERE resource_id = :resourceId
          AND operation = 'create_resource'
          AND resource_type = 'file'
          AND status IN ('pending', 'synced')
    """)
    suspend fun countCreateOperations(resourceId: String): Int

    @Query("SELECT COUNT(*) FROM pending_operations WHERE status = 'pending'")
    suspend fun countPending(): Int
}