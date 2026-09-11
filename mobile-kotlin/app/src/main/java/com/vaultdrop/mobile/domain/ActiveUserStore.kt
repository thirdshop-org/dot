package com.vaultdrop.mobile.domain

import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Miroir non-sensible du compte connecté (le token vit dans le store sécurisé).
 * Permet aux repositories de scoper leurs lectures sans dépendre du store chiffré.
 */
@Singleton
class ActiveUserStore @Inject constructor(
    private val userPreferenceDao: UserPreferenceDao,
) {

    suspend fun set(userId: String) {
        userPreferenceDao.upsert(
            UserPreferenceEntity(PrefKeys.ACTIVE_USER_ID, userId, System.currentTimeMillis()),
        )
    }

    suspend fun get(): String? = userPreferenceDao.getValue(PrefKeys.ACTIVE_USER_ID)

    suspend fun clear() = userPreferenceDao.delete(PrefKeys.ACTIVE_USER_ID)
}