package com.vaultdrop.mobile.data.remote.dto

import com.squareup.moshi.Json


/**
 * Enveloppe API V1 : succès `{ data, meta? }`, erreur `{ error }`.
 * Les deux champs étant optionnels, Moshi parse les deux formes dans le même
 * type ; c'est l'`ApiClient` qui décide selon le statut HTTP.
 */
data class ApiEnvelope<T>(
    @Json(name = "data") val data: T? = null,
    @Json(name = "meta") val meta: ApiMeta? = null,
    @Json(name = "error") val error: ApiErrorBody? = null,
)

data class ApiMeta(
    @Json(name = "page") val page: Int,
    @Json(name = "pageSize") val pageSize: Int,
    @Json(name = "total") val total: Int,
)

/**
 * Corps d'erreur normalize — miroir de `ApiErrorBody` JS.
 * Le `code` est l'identifiant contractuel (`UNAUTHORIZED`…), jamais le statut HTTP.
 */
data class ApiErrorBody(
    @Json(name = "code") val code: String,
    @Json(name = "message") val message: String,
)

/**
 * Enveloppe d'erreur du body HTTP (utilisée sur les codes non-2xx, où Retrofit
 * expose le corps brut via `errorBody()` sans le convertir).
 */
data class ApiErrorEnvelope(
    @Json(name = "error") val error: ApiErrorBody? = null,
)

/** Miroir de `api/types.ts` — `FileDto`. */
data class FileDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "size") val size: Long,
    @Json(name = "mimeType") val mimeType: String? = null,
    @Json(name = "folderId") val folderId: String? = null,
    @Json(name = "tags") val tags: List<String>? = null,
    @Json(name = "createdAt") val createdAt: String? = null,
    @Json(name = "updatedAt") val updatedAt: String? = null,
)

/** Miroir de `api/types.ts` — `FolderDto`. */
data class FolderDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "parentId") val parentId: String? = null,
)

/** Miroir de `api/types.ts` — `DeviceRegistration`. */
data class DeviceRegistrationDto(
    @Json(name = "deviceId") val deviceId: String,
)

/** Miroir de `api/types.ts` — `User`. */
data class UserDto(
    @Json(name = "id") val id: String,
    @Json(name = "username") val username: String,
    @Json(name = "is_admin") val isAdmin: Boolean = false,
)

/** Réponse de `GET /users/resolve` — `{ id, username }` uniquement. */
data class ResolvedUserDto(
    @Json(name = "id") val id: String,
    @Json(name = "username") val username: String,
)

/** Miroir de `api/types.ts` — `LoginRequest`. */
data class LoginRequestDto(
    @Json(name = "username") val username: String,
    @Json(name = "password") val password: String,
    @Json(name = "device_id") val deviceId: String,
)

/** Miroir de `api/types.ts` — `LoginResponse`. */
data class LoginResponseDto(
    @Json(name = "token") val token: String,
    @Json(name = "expires_at") val expiresAt: Long,
    @Json(name = "user") val user: UserDto,
)

/** Outbox — une op du batch `POST /sync/ops` (docs/api-v1.md §6.1). */
data class SyncOpDto(
    @Json(name = "operation_id") val operationId: String,
    @Json(name = "ref_type") val refType: String? = null,
    @Json(name = "ref_id") val refId: Long? = null,
    @Json(name = "resource_id") val resourceId: String? = null,
    @Json(name = "resource_type") val resourceType: String? = null,
    @Json(name = "operation") val operation: String,
    @Json(name = "payload") val payload: Map<String, Any?>? = null,
)

data class SyncOpsRequest(
    @Json(name = "operations") val operations: List<SyncOpDto>,
)

/** Réponse de `POST /sync/ops` : `applied` = index de la prochaine op à envoyer. */
data class SyncOpsResult(
    @Json(name = "applied") val applied: Int,
    @Json(name = "failed") val failed: SyncFailedDto? = null,
)

/** Première erreur non-idempotente du batch (arrêt du serveur). */
data class SyncFailedDto(
    @Json(name = "operation_id") val operationId: String,
    @Json(name = "code") val code: String,
    @Json(name = "message") val message: String,
)

/** Snapshot `GET /sync/permissions` (docs/api-v1.md §6.2). */
data class ResourcePermissionDto(
    @Json(name = "resource_id") val resourceId: String,
    @Json(name = "resourceType") val resourceType: String,
    @Json(name = "effectiveAccess") val effectiveAccess: String,
    @Json(name = "inherit") val inherit: Boolean,
    @Json(name = "ownerId") val ownerId: String? = null,
    @Json(name = "sharedById") val sharedById: Any? = null,
    @Json(name = "expiresAt") val expiresAt: Any? = null,
    @Json(name = "cachedAt") val cachedAt: Long,
    @Json(name = "updatedAt") val updatedAt: Long,
    @Json(name = "name") val name: String = "",
    @Json(name = "parentId") val parentId: String? = null,
)