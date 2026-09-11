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