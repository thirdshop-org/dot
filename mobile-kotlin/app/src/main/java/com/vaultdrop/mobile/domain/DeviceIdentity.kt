package com.vaultdrop.mobile.domain

import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Identité locale du device : 32-hex généré une seule fois à la première
 * requête, persisté en `user_preferences`. Équivalent de `getDeviceUserId()`.
 */
@Singleton
class DeviceIdentity @Inject constructor(
    private val userPreferenceDao: UserPreferenceDao,
    private val generateId: GenerateId,
) {

    suspend fun getOrCreate(): String {
        userPreferenceDao.getValue(PrefKeys.DEVICE_USER_ID)?.let { return it }
        val id = generateId.newResourceId()
        userPreferenceDao.insertIgnore(
            UserPreferenceEntity(PrefKeys.DEVICE_USER_ID, id, System.currentTimeMillis()),
        )
        return userPreferenceDao.getValue(PrefKeys.DEVICE_USER_ID)
            ?: generateId.newResourceId()
    }
}