package com.vaultdrop.mobile.data.remote

import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.vaultdrop.mobile.data.remote.dto.ApiEnvelope
import com.vaultdrop.mobile.data.remote.dto.ApiErrorEnvelope
import com.vaultdrop.mobile.data.remote.dto.DeviceRegistrationDto
import com.vaultdrop.mobile.data.remote.dto.FolderDto
import com.vaultdrop.mobile.data.remote.dto.LoginRequestDto
import com.vaultdrop.mobile.data.remote.dto.LoginResponseDto
import okio.IOException
import retrofit2.Response
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Erreur normalisée du client — équivalent de `ApiError` JS.
 * `code` = identifiant contractuel (`NETWORK_ERROR`, `HTTP_<status>`,
 * `INVALID_RESPONSE`, ou code du body serveur).
 */
class ApiException(
    val code: String,
    override val message: String,
    val httpCode: Int,
) : Exception(message)

/**
 * Déballage de l'enveloppe API. Miroir de `request()` dans `api/client.ts` :
 *  - échec transport → `NETWORK_ERROR` ;
 *  - non-2xx → `ApiException` (code du body si présent, sinon `HTTP_<status>`),
 *    et un 401 sur un endpoint protégé déclenche `onUnauthorized` (sauf si
 *    `skipUnauthorizedHandling` — cas du login, où 401 = identifiants erronés) ;
 *  - 2xx sans `data` (ou corps illisible) → `INVALID_RESPONSE`.
 */
@Singleton
class ApiClient @Inject constructor(
    private val apiService: ApiService,
    moshi: Moshi,
) {

    private val errorEnvelopeAdapter: JsonAdapter<ApiErrorEnvelope> =
        moshi.adapter(ApiErrorEnvelope::class.java)

    /** Callback 401 (expiration/révocation) — branché par AuthViewModel. */
    @Volatile
    var onUnauthorized: (() -> Unit)? = null

    suspend fun listFolders(): List<FolderDto> = unwrap({ apiService.listFolders() })

    suspend fun registerDevice(deviceId: String): String =
        unwrap({ apiService.registerDevice(DeviceRegistrationDto(deviceId)) }).deviceId

    suspend fun login(username: String, password: String, deviceId: String): LoginResponseDto =
        unwrap({ apiService.login(LoginRequestDto(username, password, deviceId)) },
            skipUnauthorizedHandling = true)

    private suspend fun <T> unwrap(
        call: suspend () -> Response<ApiEnvelope<T>>,
        skipUnauthorizedHandling: Boolean = false,
    ): T {
        val response = try {
            call()
        } catch (e: IOException) {
            Timber.d(e, "api: transport error")
            throw ApiException("NETWORK_ERROR", "Serveur injoignable", 0)
        } catch (e: Exception) {
            Timber.d(e, "api: unexpected error")
            throw ApiException("NETWORK_ERROR", "Serveur injoignable", 0)
        }

        if (!response.isSuccessful) {
            val status = response.code()
            if (status == 401 && !skipUnauthorizedHandling) {
                onUnauthorized?.invoke()
            }
            val error = response.errorBody()?.use { body ->
                body.string().let { raw ->
                    runCatching { errorEnvelopeAdapter.fromJson(raw)?.error }.getOrNull()
                }
            }
            throw ApiException(
                code = error?.code ?: "HTTP_$status",
                message = error?.message ?: "HTTP $status",
                httpCode = status,
            )
        }

        val envelope = response.body()
        val data = envelope?.data
        if (data == null) {
            Timber.w("api: 2xx sans enveloppe {data} (%s)", response.code())
            throw ApiException(
                code = "INVALID_RESPONSE",
                message = "Réponse serveur invalide (enveloppe {data} attendue)",
                httpCode = response.code(),
            )
        }
        return data
    }
}