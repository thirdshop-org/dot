package com.vaultdrop.mobile.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.dao.FolderDao
import com.vaultdrop.mobile.data.local.dao.PendingOperationDao
import com.vaultdrop.mobile.data.local.dao.ScanDao
import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.local.entity.ScanPageEntity
import com.vaultdrop.mobile.data.local.entity.ScanSessionEntity
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity

/*
 * DB SQLite locale, `dot.db` (même nom que la version Expo).
 * v1: folders ; v2: user_preferences ; v3: files ; v4: category sur files ;
 * v5: created_in_app sur folders ; v6: processed sur files (mode review) ;
 * v7: pending_operations (outbox) ; v8: scan_sessions + scan_pages (scanner) ;
 * v9: content sur files (corps des notes créées dans l'app).
 */
@Database(
    entities = [
        FolderEntity::class, UserPreferenceEntity::class, FileEntity::class,
        PendingOperationEntity::class, ScanSessionEntity::class, ScanPageEntity::class,
    ],
    version = 9,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun folderDao(): FolderDao
    abstract fun userPreferenceDao(): UserPreferenceDao
    abstract fun fileDao(): FileDao
    abstract fun pendingOperationDao(): PendingOperationDao
    abstract fun scanDao(): ScanDao
}