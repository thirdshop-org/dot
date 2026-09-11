package com.vaultdrop.mobile.domain

import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Base URL du serveur configurée à l'exécution dans les Réglages. Persistée en
 * `user_preferences` (clé `SERVER_URL`), exposée en [StateFlow] et lue par
 * `ServerUrlInterceptor` pour réécrire chaque requête. Le client OkHttp dédié
 * (`@Named("health")`, sans intercepteurs) sert au test de connexion direct.
 */
@Singleton
class ServerConfigStore @Inject constructor(
    private val userPreferenceDao: UserPreferenceDao,
    @Named("health") private val healthClient: OkHttpClient,
) {

    private val loaded = AtomicBoolean(false)

    private val _baseUrl = MutableStateFlow(DEFAULT_BASE_URL)
    val baseUrl: StateFlow<String> = _baseUrl.asStateFlow()

    /** Dernière base effective — lu par `ServerUrlInterceptor` (filaire, volatile). */
    val current: String
        get() = _baseUrl.value

    /** Charge la valeur persistée au boot (idempotent). */
    suspend fun load() {
        if (!loaded.compareAndSet(false, true)) return
        val stored = userPreferenceDao.getValue(PrefKeys.SERVER_URL)
        _baseUrl.value = stored?.takeIf { it.isNotBlank() }?.let(::normalize) ?: DEFAULT_BASE_URL
    }

    suspend fun set(url: String) {
        val normalized = normalize(url).ifEmpty { DEFAULT_BASE_URL }
        _baseUrl.value = normalized
        userPreferenceDao.upsert(
            UserPreferenceEntity(PrefKeys.SERVER_URL, normalized, System.currentTimeMillis()),
        )
    }

    /** Trim, ajoute `http://` si le schéma est absent, retire les `/` finaux. */
    fun normalize(url: String): String {
        var result = url.trim()
        if (result.isNotEmpty() && !result.contains("://")) result = "http://$result"
        return result.trimEnd('/')
    }

    /** Ping la route publique `/health` de la base donnée. Échoue si injoignable. */
    suspend fun checkHealth(baseUrlToTest: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val base = normalize(baseUrlToTest)
            require(base.isNotEmpty()) { "URL vide" }
            val healthUrl = (base + "/health").toHttpUrl()
            healthClient.newCall(Request.Builder().url(healthUrl).get().build()).execute().use { response ->
                require(response.isSuccessful) { "HTTP ${response.code}" }
            }
        }
    }

    companion object {
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8080/api/v1"
    }
}