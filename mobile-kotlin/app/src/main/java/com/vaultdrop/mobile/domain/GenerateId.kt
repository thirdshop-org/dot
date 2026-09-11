package com.vaultdrop.mobile.domain

import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Identifiants opaques 32-hex minuscule — équivalent de `newResourceId()` JS
 * (`lower(hex(randomblob(16)))`). Jamais reconverti en UUID côté serveur.
 */
@Singleton
class GenerateId @Inject constructor() {

    private val random = SecureRandom()

    fun newResourceId(): String {
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}