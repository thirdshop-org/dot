package com.vaultdrop.mobile.data.remote

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton
import com.vaultdrop.mobile.auth.TokenProvider

/**
 * Injecte `Authorization: Bearer <token>` sur chaque requête si un token est
 * disponible. Sans token (mode local / non connecté), aucune entête n'est posée
 * — le serveur répondra 401, géré proprement par `ApiClient`.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.current
        val requestBuilder = chain.request().newBuilder()
        if (token != null) {
            requestBuilder.header("Authorization", "Bearer $token")
        }
        return chain.proceed(requestBuilder.build())
    }
}