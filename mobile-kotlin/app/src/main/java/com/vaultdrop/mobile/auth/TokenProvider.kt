package com.vaultdrop.mobile.auth

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fournisseur du token paseto en mémoire. Remplacé plus tard par une source
 * persistante (EncryptedSharedPreferences / Keystore) une fois le login intégré.
 * `null` = mode local.
 */
@Singleton
class TokenProvider @Inject constructor() {

    @Volatile
    var current: String? = null
}