package com.vaultdrop.mobile.ui.folderlist

import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity

/** Section d'un jour dans la grille d'accueil — miroir de `FileSection` (app/index.tsx). */
data class FileSection(
    /** Début du jour en millis (fuseau local) — clé stable de la section. */
    val dayKey: Long,
    val dayLabel: String,
    val rows: List<FilePair>,
)

/** Rangée de grille : 2 cartes maximum, la droite est facultative. */
data class FilePair(
    val key: String,
    val left: FileEntity,
    val right: FileEntity? = null,
)

data class FolderListUiState(
    val subFolders: List<FolderEntity> = emptyList(),
    val sections: List<FileSection> = emptyList(),
    val isRefreshing: Boolean = false,
    val error: String? = null,
    /** Erreur transitoire de création de dossier — affichée en Snackbar puis effacée. */
    val createError: String? = null,
    /** Dossiers disponibles pour le picker de déplacement (null = pas chargé). */
    val moveFolders: List<FolderEntity>? = null,
    /** Erreur transitoire de déplacement — affichée en Snackbar puis effacée. */
    val moveError: String? = null,
)