package com.vaultdrop.mobile.domain

import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Drapeau « mode local » (on utilise l'app sans compte) persisté en
 * `user_preferences`. Permet de restaurer [com.vaultdrop.mobile.ui.auth.AuthState.Local]
 * au redémarrage au lieu de retomber sur la page de connexion.
 */
@Singleton
class LocalModeStore @Inject constructor(
    private val userPreferenceDao: UserPreferenceDao,
) {

    suspend fun set() {
        userPreferenceDao.upsert(
            UserPreferenceEntity(PrefKeys.LOCAL_MODE, "1", System.currentTimeMillis()),
        )
    }

    suspend fun get(): Boolean = userPreferenceDao.getValue(PrefKeys.LOCAL_MODE) != null

    suspend fun clear() = userPreferenceDao.delete(PrefKeys.LOCAL_MODE)
}