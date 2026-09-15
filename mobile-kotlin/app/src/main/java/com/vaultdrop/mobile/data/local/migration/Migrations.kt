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
 * v6 : ajout colonne `processed` sur `files` (mode review « traiter »). Le
 *   backlog existant est marqué traité à la migration : seuls les fichiers
 *   découverts après la mise à jour entrent dans la file de review.
 * v7 : table `pending_operations` (outbox) — file des mutations locales à
 *   pousser vers `POST /sync/ops` (uuid 32-hex client-generated, cf.
 *   docs/api-v1.md §6.1).
 * v8 : tables `scan_sessions` + `scan_pages` (scanner appareil photo) — session
 *   multi-pages persistée pour survivre au process death avant export SAF.
 * v9 : ajout colonne `content` sur `files` — corps d'une note créée dans
 *   l'app (fichier cloud-only, uri = NULL). Null pour les fichiers importés.
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

    private val MIGRATION_5_6 = object : Migration(5, 6) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE `files` ADD COLUMN `processed` INTEGER NOT NULL DEFAULT 0")
            // Backlog = déjà traité : la file de review ne contient que les
            // fichiers découverts après l'activation de la fonctionnalité.
            db.execSQL("UPDATE `files` SET `processed` = 1")
        }
    }

    private val MIGRATION_6_7 = object : Migration(6, 7) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `pending_operations` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `operation_id` TEXT NOT NULL,
                    `ref_type` TEXT,
                    `ref_id` INTEGER,
                    `resource_id` TEXT,
                    `resource_type` TEXT,
                    `operation` TEXT NOT NULL,
                    `payload` TEXT NOT NULL,
                    `status` TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'synced', 'failed')),
                    `attempts` INTEGER NOT NULL DEFAULT 0,
                    `created_at` INTEGER NOT NULL,
                    `updated_at` INTEGER NOT NULL
                )
                """.trimIndent(),
            )
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_pending_operations_operation_id` ON `pending_operations` (`operation_id`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_pending_operations_status` ON `pending_operations` (`status`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_pending_operations_resource_id` ON `pending_operations` (`resource_id`)")
        }
    }

    private val MIGRATION_7_8 = object : Migration(7, 8) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `scan_sessions` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `resource_id` TEXT NOT NULL,
                    `root_folder_id` TEXT,
                    `status` TEXT NOT NULL,
                    `created_at` INTEGER NOT NULL,
                    `updated_at` INTEGER NOT NULL
                )
                """.trimIndent(),
            )
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_scan_sessions_resource_id` ON `scan_sessions` (`resource_id`)")
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `scan_pages` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `resource_id` TEXT NOT NULL,
                    `session_id` INTEGER NOT NULL,
                    `temp_uri` TEXT NOT NULL,
                    `corners_json` TEXT NOT NULL,
                    `width` INTEGER NOT NULL,
                    `height` INTEGER NOT NULL,
                    `sort_order` INTEGER NOT NULL,
                    `status` TEXT NOT NULL,
                    `created_at` INTEGER NOT NULL,
                    FOREIGN KEY(`session_id`) REFERENCES `scan_sessions`(`id`)
                        ON UPDATE NO ACTION ON DELETE CASCADE
                )
                """.trimIndent(),
            )
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_scan_pages_resource_id` ON `scan_pages` (`resource_id`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_scan_pages_session_id` ON `scan_pages` (`session_id`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_scan_pages_sort_order` ON `scan_pages` (`sort_order`)")
        }
    }

    private val MIGRATION_8_9 = object : Migration(8, 9) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE `files` ADD COLUMN `content` TEXT")
        }
    }

    val ALL: Array<Migration> = arrayOf(
        MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9,
    )
}