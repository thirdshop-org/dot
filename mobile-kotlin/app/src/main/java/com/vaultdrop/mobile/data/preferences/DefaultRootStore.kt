package com.vaultdrop.mobile.data.preferences

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Racine VaultDrop : le dossier SAF unique et obligatoire choisi au premier
 * lancement. Tous les exports (assemblage PDF) y sont écrits directement,
 * sans sélecteur — la permission persistante sur l'arbre est acquise à ce
 * moment-là.
 */
@Singleton
class DefaultRootStore @Inject constructor(
    @ApplicationContext context: Context,
) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    fun get(): String? = prefs.getString(KEY_ROOT_RESOURCE_ID, null)

    fun set(resourceId: String) {
        prefs.edit().putString(KEY_ROOT_RESOURCE_ID, resourceId).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_ROOT_RESOURCE_ID).apply()
    }

    companion object {
        private const val FILE_NAME = "vaultdrop_prefs"
        private const val KEY_ROOT_RESOURCE_ID = "vaultdrop.default_root_resource_id"
    }
}