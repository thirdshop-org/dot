package com.vaultdrop.mobile.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.vaultdrop.mobile.data.remote.dto.UserDto
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persistance chiffrée du token paseto et du profil compte (Keystore + AES).
 * Miroir de `services/secureStore.ts` (expo-secure-store). Le token n'est
 * JAMAIS écrit en clair dans SQLite.
 */
@Singleton
class SecureTokenStore @Inject constructor(
    @ApplicationContext context: Context,
    moshi: Moshi,
) {

    private val userAdapter: JsonAdapter<UserDto> = moshi.adapter(UserDto::class.java)

    private val prefs: SharedPreferences = run {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            FILE_NAME,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun getUser(): UserDto? {
        val raw = prefs.getString(KEY_ACCOUNT, null) ?: return null
        return runCatching { userAdapter.fromJson(raw) }
            .getOrNull()
            ?.takeIf { it.id.isNotEmpty() && it.username.isNotEmpty() }
    }

    fun save(token: String, user: UserDto) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_ACCOUNT, userAdapter.toJson(user))
            .apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_ACCOUNT).apply()
    }

    companion object {
        private const val FILE_NAME = "vaultdrop_secure"
        private const val KEY_TOKEN = "vaultdrop.auth_token"
        private const val KEY_ACCOUNT = "vaultdrop.account"
    }
}