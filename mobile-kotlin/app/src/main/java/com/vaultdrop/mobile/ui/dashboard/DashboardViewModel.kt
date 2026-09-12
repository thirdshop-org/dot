package com.vaultdrop.mobile.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.data.repository.FileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    fileRepository: FileRepository,
) : ViewModel() {

    /** Nombre de documents locaux restant à traiter (mode review). */
    val unprocessedCount: StateFlow<Int> = fileRepository.observeUnprocessedCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initialValue = 0)
}