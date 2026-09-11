package com.vaultdrop.mobile.domain

import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.UserPreferenceEntity
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Préférence de thème (clair/sombre) : valeur par défaut SYSTEM, chargée une
 * fois depuis `user_preferences` puis exposée en [StateFlow]. La source le
 * thread-safe : écritures et lectures passent par le DAO Room (IO).
 */
@Singleton
class ThemePreferenceStore @Inject constructor(
    private val userPreferenceDao: UserPreferenceDao,
) {

    private val loaded = AtomicBoolean(false)

    private val _theme = MutableStateFlow<ThemePreference>(ThemePreference.SYSTEM)
    val theme: StateFlow<ThemePreference> = _theme.asStateFlow()

    /** Charge la valeur persistée au boot (idempotent). */
    suspend fun load() {
        if (!loaded.compareAndSet(false, true)) return
        val stored = userPreferenceDao.getValue(PrefKeys.THEME)
        _theme.value = ThemePreference.fromStored(stored)
    }

    suspend fun set(theme: ThemePreference) {
        _theme.value = theme
        userPreferenceDao.upsert(
            UserPreferenceEntity(PrefKeys.THEME, theme.storedValue, System.currentTimeMillis()),
        )
    }
}