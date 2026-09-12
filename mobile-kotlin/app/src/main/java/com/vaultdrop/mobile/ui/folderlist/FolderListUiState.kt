package com.vaultdrop.mobile.ui.folderlist

import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity

/** Layer d'affichage de la page Fichiers. */
enum class HomeView {
    FILES,
    FOLDERS,
    DASHBOARD,
}

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
    /** Segment actif de la page (Fichiers / Dossiers / Dashboard). */
    val view: HomeView = HomeView.DASHBOARD,
    /** Vrai pendant le déplacement d'une sélection : la vue Dossiers est forcée. */
    val moveMode: Boolean = false,
    /** Vue à restaurer après déplacement/annulation. */
    val viewBeforeMove: HomeView? = null,
    /** Dossier courant de l'explorateur Dossiers (null = racine par défaut). */
    val browseFolderId: String? = null,
    /** Nom du dossier courant (racine incluse) — fil d'ariane de l'explorateur. */
    val browseFolderName: String? = null,
    /** Sous-dossiers visibles du dossier courant de l'explorateur. */
    val browseSubFolders: List<FolderEntity> = emptyList(),
    val sections: List<FileSection> = emptyList(),
    val isRefreshing: Boolean = false,
    val error: String? = null,
    /** Erreur transitoire de création de dossier — affichée en Snackbar puis effacée. */
    val createError: String? = null,
    /** Erreur transitoire de déplacement — affichée en Snackbar puis effacée. */
    val moveError: String? = null,
    /** Succès transitoire de déplacement — affiché en Snackbar puis effacé. */
    val moveSuccess: Boolean = false,
)