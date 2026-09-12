package com.vaultdrop.mobile.ui.watchedfolders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FolderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** État des dossiers SAF surveillés, partagé entre le badge du header et l'écran de liste. */
@HiltViewModel
class WatchedFoldersViewModel @Inject constructor(
    folderRepository: FolderRepository,
) : ViewModel() {

    /** Liste live des racines SAF surveillées (uri non nulle). */
    val folders: Flow<List<FolderEntity>> = folderRepository.observeSafRoots()

    /** Nombre de racines surveillées — l'UI plafonne l'affichage à 99 (« 99+ »). */
    val count: StateFlow<Int> = folderRepository.observeSafRoots()
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0)
}