package com.vaultdrop.mobile.data.repository

import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.vaultdrop.mobile.data.local.dao.PendingOperationDao
import com.vaultdrop.mobile.data.local.entity.PendingOpStatus
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationType
import com.vaultdrop.mobile.domain.GenerateId
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Antichambre de l'outbox : enregistre les mutations locales (métadonnées JSON
 * uniquement) à pousser vers `POST /sync/ops`.
 *
 * **Contrat d'atomicité** : `enqueue` doit être appelé dans le MÊME bloc
 * `AppDatabase.withTransaction { … }` que la mutation Room correspondante —
 * la file et l'état local évoluent ensemble (pattern transactional outbox).
 */
@Singleton
class OutboxRepository @Inject constructor(
    private val pendingOperationDao: PendingOperationDao,
    private val generateId: GenerateId,
    moshi: Moshi,
) {

    private val payloadAdapter: JsonAdapter<Map<String, Any?>> = moshi.adapter(
        Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java),
    )

    /**
     * Enregistre une op à pousser. Retourne l'`operationId` 32-hex (exposé en
     * `operation_id` du protocole). À appeler dans un `withTransaction`.
     */
    suspend fun enqueue(
        operation: String,
        resourceId: String,
        resourceType: String,
        payload: Map<String, Any?> = emptyMap(),
        refType: String? = null,
        refId: Long? = null,
    ): String {
        val operationId = generateId.newResourceId()
        val now = System.currentTimeMillis()
        pendingOperationDao.insert(
            PendingOperationEntity(
                operationId = operationId,
                refType = refType,
                refId = refId,
                resourceId = resourceId,
                resourceType = resourceType,
                operation = operation,
                payload = payloadAdapter.toJson(payload),
                status = PendingOpStatus.PENDING,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return operationId
    }

    /** Raccourci `create_resource` (folder/file) — docs/api-v1.md §6.1. */
    suspend fun enqueueCreateResource(
        resourceId: String,
        resourceType: String,
        name: String,
        parentResourceId: String? = null,
        mimeType: String? = null,
        extension: String? = null,
    ): String = enqueue(
        operation = PendingOperationType.CREATE_RESOURCE,
        resourceId = resourceId,
        resourceType = resourceType,
        payload = buildMap {
            put("name", name)
            parentResourceId?.let { put("parentResourceId", it) }
            mimeType?.let { put("mimeType", it) }
            extension?.let { put("extension", it) }
        },
    )

    /** Raccourci `move_resource` — payload `{ toFolderResourceId }`. */
    suspend fun enqueueMoveResource(
        resourceId: String,
        resourceType: String,
        toFolderResourceId: String,
    ): String = enqueue(
        operation = PendingOperationType.MOVE_RESOURCE,
        resourceId = resourceId,
        resourceType = resourceType,
        payload = mapOf("toFolderResourceId" to toFolderResourceId),
    )

    /** Raccourci `delete_resource` — idempotent côté serveur. */
    suspend fun enqueueDeleteResource(
        resourceId: String,
        resourceType: String,
    ): String = enqueue(
        operation = PendingOperationType.DELETE_RESOURCE,
        resourceId = resourceId,
        resourceType = resourceType,
    )

    /** Nombre d'ops en attente de push (stats UI optionnelles). */
    suspend fun countPending(): Int = pendingOperationDao.countPending()

    /**
     * Un `create_resource` (pending ou synced) existe-t-il déjà pour ce fichier ?
     * Utilisé par le gate « processed » : seuls les fichiers traités déclenchent
     * le push, et jamais deux fois.
     */
    suspend fun hasCreateOperation(resourceId: String): Boolean =
        pendingOperationDao.countCreateOperations(resourceId) > 0
}