package com.vaultdrop.mobile.data.repository

import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.dto.LoginResponseDto
import com.vaultdrop.mobile.domain.DeviceIdentity
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Flux d'auth. Le device s'enregistre d'abord (`POST /devices`, idempotent,
 * aucun token émis), puis `POST /auth/login` émet le paseto.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val apiClient: ApiClient,
    private val deviceIdentity: DeviceIdentity,
) {

    /** Enregistrement best-effort du device (offline → ignoré). */
    suspend fun registerDevice(): String {
        val deviceId = deviceIdentity.getOrCreate()
        runCatching { apiClient.registerDevice(deviceId) }
            .onFailure { Timber.d(it, "auth: device registration failed (offline?)") }
        return deviceId
    }

    suspend fun login(username: String, password: String): LoginResponseDto {
        val deviceId = deviceIdentity.getOrCreate()
        // Re-registration idempotente juste avant le login : un device inconnu
        // du serveur (ex. restart de la base) répondrait INVALID_DEVICE_ID.
        runCatching { apiClient.registerDevice(deviceId) }
            .onFailure { Timber.d(it, "auth: pre-login registration failed") }
        return apiClient.login(username.trim(), password, deviceId)
    }
}