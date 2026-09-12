package com.vaultdrop.mobile.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Miroir de `FolderRow` (mobile/services/db/types.ts).
 *
 * `uri` est NULL pour les dossiers cloud-only ; l'index unique est posé sur la
 * colonne directement (SQLite traite les NULL comme distincts, donc plusieurs
 * lignes sans uri cohabitent — équivalent sémantique de l'index partiel
 * `WHERE uri IS NOT NULL` du schéma JS).
 *
 * Statuts : 'local' | 'cloud' | 'local-cloud' (placement).
 */
@Entity(
    tableName = "folders",
    indices = [
        Index(value = ["resource_id"], unique = true),
        Index(value = ["uri"], unique = true),
        Index(value = ["parent_resource_id"]),
    ],
)
data class FolderEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "resource_id")
    val resourceId: String,
    @ColumnInfo(name = "uri")
    val uri: String? = null,
    @ColumnInfo(name = "name")
    val name: String,
    @ColumnInfo(name = "exists")
    val exists: Int? = null,
    @ColumnInfo(name = "parent_resource_id")
    val parentResourceId: String? = null,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "local",
    @ColumnInfo(name = "created_in_app", defaultValue = "0")
    val createdInApp: Boolean = false,
    @ColumnInfo(name = "added_at")
    val addedAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
)

/** Placement d'un dossier — miroir de `SyncStatus` JS. */
object FolderStatus {
    const val LOCAL = "local"
    const val CLOUD = "cloud"
    const val LOCAL_CLOUD = "local-cloud"
}