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

    @Query("SELECT * FROM folders WHERE parent_resource_id IS NULL ORDER BY name ASC")
    fun observeRootFolders(): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders WHERE parent_resource_id IS NULL ORDER BY name ASC")
    suspend fun getRootFolders(): List<FolderEntity>

    @Query("SELECT * FROM folders WHERE parent_resource_id = :parentResourceId AND \"exists\" = 1 ORDER BY name ASC")
    fun observeByParent(parentResourceId: String): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders WHERE parent_resource_id = :parentResourceId ORDER BY name ASC")
    suspend fun getByParent(parentResourceId: String): List<FolderEntity>

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

    @Query("DELETE FROM folders WHERE resource_id = :resourceId")
    suspend fun remove(resourceId: String)
}