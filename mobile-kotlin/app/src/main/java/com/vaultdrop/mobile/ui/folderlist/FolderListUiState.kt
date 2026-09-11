package com.vaultdrop.mobile.ui.folderlist

import com.vaultdrop.mobile.data.local.entity.FolderEntity

data class FolderListUiState(
    val folders: List<FolderEntity> = emptyList(),
    val isRefreshing: Boolean = false,
    val error: String? = null,
)