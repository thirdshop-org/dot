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

    /**
     * Raccourci `share` — payload `{ granteeUserId, access }` (voir
     * docs/api-v1.md §6.1). `access`: viewer | commenter | editor.
     */
    suspend fun enqueueShare(
        resourceId: String,
        resourceType: String,
        granteeUserId: String,
        access: String,
        inherit: Boolean = true,
        expiresAt: Long? = null,
    ): String = enqueue(
        operation = PendingOperationType.SHARE,
        resourceId = resourceId,
        resourceType = resourceType,
        payload = buildMap {
            put("granteeUserId", granteeUserId)
            put("access", access)
            put("inherit", inherit)
            expiresAt?.let { put("expiresAt", it) }
        },
    )

    /** Raccourci `revoke_share` — payload `{ granteeUserId }`. */
    suspend fun enqueueRevokeShare(
        resourceId: String,
        resourceType: String,
        granteeUserId: String,
    ): String = enqueue(
        operation = PendingOperationType.REVOKE_SHARE,
        resourceId = resourceId,
        resourceType = resourceType,
        payload = mapOf("granteeUserId" to granteeUserId),
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

    /**
     * Un `move_resource` est-il encore en attente de push ? Tant que l'op est
     * pendante, le `folder_resource_id` local reflète la cible future : ni le
     * refresh serveur (qui renvoie l'ancien dossier) ni le walk SAF (snapshot
     * périmé) ne doivent l'écraser.
     */
    suspend fun hasPendingMoveOperation(resourceId: String): Boolean =
        pendingOperationDao.countPendingMoveOperations(resourceId) > 0

    /**
     * Un `move_resource` (pending ou synced) a-t-il jamais été journalisé ?
     * Utilisé par la réconciliation du walk : une ligne en transition physique
     * ne doit pas être masquée (`exists = 0`) avant convergence.
     */
    suspend fun hasMoveOperation(resourceId: String): Boolean =
        pendingOperationDao.countMoveOperations(resourceId) > 0
}