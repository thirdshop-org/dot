package com.vaultdrop.mobile.data.remote

import com.vaultdrop.mobile.data.remote.dto.ApiEnvelope
import com.vaultdrop.mobile.data.remote.dto.DeviceRegistrationDto
import com.vaultdrop.mobile.data.remote.dto.FileDto
import com.vaultdrop.mobile.data.remote.dto.FolderDto
import com.vaultdrop.mobile.data.remote.dto.LoginRequestDto
import com.vaultdrop.mobile.data.remote.dto.LoginResponseDto
import com.vaultdrop.mobile.data.remote.dto.ResourcePermissionDto
import com.vaultdrop.mobile.data.remote.dto.SyncOpsRequest
import com.vaultdrop.mobile.data.remote.dto.SyncOpsResult
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Contrat HTTP V1 — copie de `mobile/api/client.ts` (le client mobile est la
 * source de vérité). Les méthodes renvoient `Response<ApiEnvelope<T>>` pour
 * que l'`ApiClient` puisse dissocier succès / erreur contractuelle.
 */
interface ApiService {

    @GET("files/folders")
    suspend fun listFolders(): Response<ApiEnvelope<List<FolderDto>>>

    /** Équivalent de `GET /files` (client.ts). Paginé (`meta`). */
    @GET("files")
    suspend fun listFiles(
        @Query("folderId") folderId: String?,
        @Query("page") page: Int?,
        @Query("pageSize") pageSize: Int?,
    ): Response<ApiEnvelope<List<FileDto>>>

    /** Enregistrement idempotent du device — aucun token émis. */
    @POST("devices")
    suspend fun registerDevice(
        @Body body: DeviceRegistrationDto,
    ): Response<ApiEnvelope<DeviceRegistrationDto>>

    /** Seule porte d'émission de token (V1). 401 = mauvaises identifiants. */
    @POST("auth/login")
    suspend fun login(
        @Body body: LoginRequestDto,
    ): Response<ApiEnvelope<LoginResponseDto>>

    /** Outbox client→serveur : applique un batch séquentiel, idempotent par device. */
    @POST("sync/ops")
    suspend fun syncOps(
        @Body body: SyncOpsRequest,
    ): Response<ApiEnvelope<SyncOpsResult>>

    /** Snapshot des permissions effectives (delta si `after` fourni, ms epoch). */
    @GET("sync/permissions")
    suspend fun syncPermissions(
        @Query("after") after: Long? = null,
    ): Response<ApiEnvelope<List<ResourcePermissionDto>>>
}