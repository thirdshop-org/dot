package com.vaultdrop.mobile.data.local.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Versions Room du schéma Kotlin.
 *
 * v1 : table `folders` (créée par Room à partir de l'entité).
 * v2 : table `user_preferences` — clé/valeur pour l'identité device, le miroir
 *   du compte actif et les préférences utilisateur.
 */
object Migrations {

    private val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `user_preferences` (
                    `key` TEXT NOT NULL,
                    `value` TEXT NOT NULL,
                    `updated_at` INTEGER NOT NULL,
                    PRIMARY KEY(`key`)
                )
                """.trimIndent(),
            )
        }
    }

    val ALL: Array<Migration> = arrayOf(MIGRATION_1_2)
}