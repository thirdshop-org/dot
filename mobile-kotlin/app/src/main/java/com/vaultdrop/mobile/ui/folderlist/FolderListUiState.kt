package com.vaultdrop.mobile.ui.folderlist

import com.vaultdrop.mobile.data.local.entity.FolderEntity

data class FolderListUiState(
    val folders: List<FolderEntity> = emptyList(),
    val isRefreshing: Boolean = false,
    /** true pendant l'exploration SAF d'une racine (marche récursive en cours). */
    val isScanning: Boolean = false,
    val error: String? = null,
)