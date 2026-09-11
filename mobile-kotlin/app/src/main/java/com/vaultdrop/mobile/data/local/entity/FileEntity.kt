package com.vaultdrop.mobile.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Miroir de `FileRow` (mobile/services/db/types.ts).
 *
 * `uri` NULL = fichier cloud-only (pas de copie physique locale) ; l'index
 * unique est posé sur la colonne directement (SQLite traite les NULL comme
 * distincts — équivalent de l'index partiel JS `WHERE uri IS NOT NULL`).
 *
 * `folder_resource_id` = resource_id du dossier hôte (jamais NULL côté SQLite
 * JS ; les fichiers racine sont rares et hors scope V1).
 */
@Entity(
    tableName = "files",
    indices = [
        Index(value = ["resource_id"], unique = true),
        Index(value = ["uri"], unique = true),
        Index(value = ["folder_resource_id"]),
        Index(value = ["category"]),
    ],
)
data class FileEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "resource_id")
    val resourceId: String,
    @ColumnInfo(name = "uri")
    val uri: String? = null,
    @ColumnInfo(name = "name")
    val name: String,
    @ColumnInfo(name = "folder_resource_id")
    val folderResourceId: String,
    @ColumnInfo(name = "extension")
    val extension: String? = null,
    @ColumnInfo(name = "size")
    val size: Long,
    @ColumnInfo(name = "mime_type")
    val mimeType: String? = null,
    @ColumnInfo(name = "exists")
    val exists: Int? = null,
    @ColumnInfo(name = "last_modified")
    val lastModified: Long? = null,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "category")
    val category: String? = null,
    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "local",
    @ColumnInfo(name = "added_at")
    val addedAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
)

/** Placement d'un fichier — même convention que `FolderStatus`. */
object FileStatus {
    const val LOCAL = "local"
    const val CLOUD = "cloud"
    const val LOCAL_CLOUD = "local-cloud"
}