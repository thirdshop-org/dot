package com.vaultdrop.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity

@Dao
interface UserPreferenceDao {

    @Query("SELECT * FROM user_preferences WHERE `key` = :key LIMIT 1")
    suspend fun get(key: String): UserPreferenceEntity?

    @Query("SELECT value FROM user_preferences WHERE `key` = :key LIMIT 1")
    suspend fun getValue(key: String): String?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(pref: UserPreferenceEntity)

    @Upsert
    suspend fun upsert(pref: UserPreferenceEntity)

    @Query("DELETE FROM user_preferences WHERE `key` = :key")
    suspend fun delete(key: String)
}