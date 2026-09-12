package com.vaultdrop.mobile.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Outbox locale (transactional outbox pattern) — file des mutations locales
 * à pousser vers le serveur via `POST /sync/ops`.
 *
 * `id` = PK auto-incr Room (interne : tri, statut) ; `operationId` = UUID
 * 32-hex généré côté client, c'est la valeur exposée en `operation_id` du
 * protocole (cf. docs/api-v1.md §6.1). L'idempotence serveur s'appuie sur
 * `UNIQUE(device_id, operation_id)`.
 *
 * `payload` = métadonnées JSON légères uniquement — jamais de blobs binaires
 * (l'upload physique reste un pipeline multipart séparé, hors outbox).
 */
@Entity(
    tableName = "pending_operations",
    indices = [
        Index(value = ["operation_id"], unique = true),
        Index(value = ["status"]),
        Index(value = ["resource_id"]),
    ],
)
data class PendingOperationEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "operation_id")
    val operationId: String,
    @ColumnInfo(name = "ref_type")
    val refType: String? = null,
    @ColumnInfo(name = "ref_id")
    val refId: Long? = null,
    @ColumnInfo(name = "resource_id")
    val resourceId: String? = null,
    @ColumnInfo(name = "resource_type")
    val resourceType: String? = null,
    @ColumnInfo(name = "operation")
    val operation: String,
    @ColumnInfo(name = "payload")
    val payload: String,
    @ColumnInfo(name = "status")
    val status: String = PendingOpStatus.PENDING,
    @ColumnInfo(name = "attempts")
    val attempts: Int = 0,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
)

/** Statuts d'une op outbox — `pushStatus` du contrat sync (pending/synced/failed). */
object PendingOpStatus {
    const val PENDING = "pending"
    const val SYNCED = "synced"
    const val FAILED = "failed"
}

/** Types d'opérations de l'outbox — miroir de `PendingOperationType` (docs/api-v1.md §6.1). */
object PendingOperationType {
    const val CREATE_RESOURCE = "create_resource"
    const val UPDATE_METADATA = "update_metadata"
    const val DELETE_RESOURCE = "delete_resource"
    const val MOVE_RESOURCE = "move_resource"
    const val SHARE = "share"
    const val REVOKE_SHARE = "revoke_share"
    const val UPDATE_SHARE = "update_share"
    const val CREATE_LINK = "create_link"
    const val REVOKE_LINK = "revoke_link"
}