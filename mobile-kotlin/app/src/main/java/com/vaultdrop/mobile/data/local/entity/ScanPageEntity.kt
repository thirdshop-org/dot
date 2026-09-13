package com.vaultdrop.mobile.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Page capturée et validée d'une session de scan.
 *
 * `temp_uri` = chemin du fichier JPEG final (croppé + redressé) dans
 * `filesDir/scan_sessions/{session.id}/` ; `corners_json` mémorise le quadrilatère
 * pour ré-éditer la page. L'export SAF se fait à la validation de session.
 */
@Entity(
    tableName = "scan_pages",
    foreignKeys = [
        ForeignKey(
            entity = ScanSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["resource_id"], unique = true),
        Index(value = ["session_id"]),
        Index(value = ["sort_order"]),
    ],
)
data class ScanPageEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "resource_id")
    val resourceId: String,
    @ColumnInfo(name = "session_id")
    val sessionId: Long,
    @ColumnInfo(name = "temp_uri")
    val tempUri: String,
    @ColumnInfo(name = "corners_json")
    val cornersJson: String,
    @ColumnInfo(name = "width")
    val width: Int,
    @ColumnInfo(name = "height")
    val height: Int,
    @ColumnInfo(name = "sort_order")
    val sortOrder: Int,
    @ColumnInfo(name = "status")
    val status: String = ScanPageStatus.PENDING,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
)

/** Statuts d'une page de scan. */
object ScanPageStatus {
    const val PENDING = "pending"
    const val EXPORTED = "exported"
}