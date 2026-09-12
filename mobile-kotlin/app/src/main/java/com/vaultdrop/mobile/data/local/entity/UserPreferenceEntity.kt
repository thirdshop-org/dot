package com.vaultdrop.mobile.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Miroir de la table `user_preferences` JS (`key`/`value`/`updated_at`).
 * Clés connues : `device_user_id` (32-hex, généré une fois), `sync_mode`,
 * `active_user_id` (miroir non-sensible du compte connecté), `local_mode`
 * (app utilisée sans compte).
 */
@Entity(tableName = "user_preferences")
data class UserPreferenceEntity(
    @PrimaryKey
    @ColumnInfo(name = "key")
    val key: String,
    @ColumnInfo(name = "value")
    val value: String,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
)