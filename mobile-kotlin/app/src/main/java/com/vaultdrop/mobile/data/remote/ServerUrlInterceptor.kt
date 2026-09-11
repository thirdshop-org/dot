package com.vaultdrop.mobile.data.remote

import com.vaultdrop.mobile.domain.ServerConfigStore
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber

/**
 * Réécrit chaque requête vers la base URL configurée à l'exécution (Réglages).
 * La base Retrofit n'est qu'un placeholder ; c'est cet interceptor qui décide
 * du schéma/host/port réels, en préservant le préfixe de chemin de la base
 * configurée (ex. `/api/v1`) ainsi que la query d'origine.
 */
@Singleton
class ServerUrlInterceptor @Inject constructor(
    private val serverConfigStore: ServerConfigStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        val targetUrl = runCatching {
            (serverConfigStore.current.trimEnd('/') + "/").toHttpUrl()
        }.getOrNull()

        if (targetUrl == null) {
            Timber.w("server-url: base URL invalide, requête non réécrite")
            return chain.proceed(request)
        }

        val original = request.url
        val rewritten = targetUrl.newBuilder()
            .encodedPath(targetUrl.encodedPath.trimEnd('/') + "/" + original.encodedPath.trimStart('/'))
            .encodedQuery(original.encodedQuery)
            .build()

        return chain.proceed(request.newBuilder().url(rewritten).build())
    }
}