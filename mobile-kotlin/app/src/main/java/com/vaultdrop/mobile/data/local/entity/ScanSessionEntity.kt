package com.vaultdrop.mobile.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Session de scan multi-pages (appareil photo). Persistée pour survivre au
 * process death : les pages validées sont enregistrées avant export.
 *
 * `root_folder_id` = dossier racine SAF cible de l'export (optionnel, NULL si
 * aucun root n'est encore défini au moment du scan).
 */
@Entity(
    tableName = "scan_sessions",
    indices = [
        Index(value = ["resource_id"], unique = true),
    ],
)
data class ScanSessionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "resource_id")
    val resourceId: String,
    @ColumnInfo(name = "root_folder_id")
    val rootFolderId: String? = null,
    @ColumnInfo(name = "status")
    val status: String = ScanSessionStatus.ACTIVE,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
)

/** Statuts d'une session de scan. */
object ScanSessionStatus {
    const val ACTIVE = "active"
    const val DONE = "done"
    const val ABANDONED = "abandoned"
}