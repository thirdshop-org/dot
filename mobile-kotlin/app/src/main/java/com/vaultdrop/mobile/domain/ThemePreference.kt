package com.vaultdrop.mobile.domain

/**
 * Préférence d'affichage de la page Réglages, persistée dans `user_preferences`.
 * `SYSTEM` (défaut) = suivre le thème du système ; `LIGHT`/`DARK` = forcer.
 */
enum class ThemePreference(val storedValue: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    ;

    companion object {
        fun fromStored(value: String?): ThemePreference =
            entries.firstOrNull { it.storedValue == value } ?: SYSTEM
    }
}