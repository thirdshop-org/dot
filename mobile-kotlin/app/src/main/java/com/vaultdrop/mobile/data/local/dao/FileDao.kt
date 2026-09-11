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

    @Query("SELECT * FROM files WHERE \"exists\" = 1 ORDER BY added_at DESC, name ASC")
    fun observeAllVisible(): Flow<List<FileEntity>>

    @Query("SELECT * FROM files WHERE resource_id = :resourceId LIMIT 1")
    suspend fun getByResourceId(resourceId: String): FileEntity?

    @Query("SELECT * FROM files WHERE uri = :uri LIMIT 1")
    suspend fun getByUri(uri: String): FileEntity?

    @Upsert
    suspend fun upsert(file: FileEntity)

    @Query("UPDATE files SET \"exists\" = 0, updated_at = :updatedAt WHERE resource_id = :resourceId")
    suspend fun markMissing(resourceId: String, updatedAt: Long)

    @Query("DELETE FROM files WHERE resource_id = :resourceId")
    suspend fun remove(resourceId: String)
}