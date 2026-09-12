package com.vaultdrop.mobile.data.local.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Versions Room du schéma Kotlin.
 *
 * v1 : table `folders` (créée par Room à partir de l'entité).
 * v2 : table `user_preferences` — clé/valeur pour l'identité device, le miroir
 *   du compte actif et les préférences utilisateur.
 * v3 : table `files` — miroir de `FileRow` JS (métadonnées locales + cloud).
 * v4 : ajout colonne `category` + index sur `files`.
 * v5 : ajout colonne `created_in_app` sur `folders` (marqueur « créé dans
 *   l'app » — 0 par défaut pour les dossiers importés/Parcourus SAF, 1 pour la
 *   feature « Créer un dossier ». Utilisé pour filtrer le picker de déplacement).
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

    private val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `files` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `resource_id` TEXT NOT NULL,
                    `uri` TEXT,
                    `name` TEXT NOT NULL,
                    `folder_resource_id` TEXT NOT NULL,
                    `extension` TEXT,
                    `size` INTEGER NOT NULL,
                    `mime_type` TEXT,
                    `exists` INTEGER,
                    `last_modified` INTEGER,
                    `owner_id` TEXT,
                    `sync_status` TEXT NOT NULL,
                    `added_at` INTEGER NOT NULL,
                    `updated_at` INTEGER NOT NULL
                )
                """.trimIndent(),
            )
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_files_resource_id` ON `files` (`resource_id`)")
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_files_uri` ON `files` (`uri`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_files_folder_resource_id` ON `files` (`folder_resource_id`)")
        }
    }

    private val MIGRATION_3_4 = object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Pas de `DEFAULT NULL` explicite : Room s'attend à l'absence de défaut
            // (une colonne TEXT nullable a déjà NULL comme défaut implicite).
            db.execSQL("ALTER TABLE `files` ADD COLUMN `category` TEXT")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_files_category` ON `files` (`category`)")
        }
    }

    private val MIGRATION_4_5 = object : Migration(4, 5) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE `folders` ADD COLUMN `created_in_app` INTEGER NOT NULL DEFAULT 0")
        }
    }

    val ALL: Array<Migration> = arrayOf(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
}