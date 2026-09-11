package com.vaultdrop.mobile.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.vaultdrop.mobile.data.local.dao.FolderDao
import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity

/*
 * DB SQLite locale, `dot.db` (même nom que la version Expo).
 * v1: folders ; v2: user_preferences.
 */
@Database(
    entities = [FolderEntity::class, UserPreferenceEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun folderDao(): FolderDao
    abstract fun userPreferenceDao(): UserPreferenceDao
}