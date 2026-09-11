package com.vaultdrop.mobile.ui.folderlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import com.vaultdrop.mobile.features.sync.DeviceSync
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class FolderListViewModel @Inject constructor(
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val tokenProvider: TokenProvider,
    private val deviceSync: DeviceSync,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FolderListUiState())
    val uiState: StateFlow<FolderListUiState> = _uiState.asStateFlow()

    init {
        observeFiles()
        refresh()
    }

    /** Grille d'accueil : tous les fichiers visibles, groupés par jour (addedAt). */
    private fun observeFiles() {
        viewModelScope.launch {
            fileRepository.observeAllVisible().collect { files ->
                _uiState.update { it.copy(sections = groupFilesByDay(files)) }
            }
        }
    }

    /** Miroir de `groupFilesByDay` (app/index.tsx) : sections triées du plus récent
     *  au plus vieux, fichiers d'un jour triés par date décroissante, en paires. */
    private fun groupFilesByDay(files: List<FileEntity>): List<FileSection> {
        val zone = ZoneId.systemDefault()
        return files
            .groupBy { startOfDay(it.addedAt, zone) }
            .entries
            .sortedByDescending { it.key }
            .map { (day, list) ->
                val rows = list.sortedByDescending { it.addedAt }
                    .chunked(2)
                    .map { pair ->
                        FilePair(
                            key = pair.joinToString { it.resourceId },
                            left = pair[0],
                            right = pair.getOrNull(1),
                        )
                    }
                FileSection(dayKey = day, dayLabel = formatDayLabel(day, zone), rows = rows)
            }
    }

    private fun startOfDay(millis: Long, zone: ZoneId): Long =
        Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
            .atStartOfDay(zone).toInstant().toEpochMilli()

    private fun formatDayLabel(millis: Long, zone: ZoneId): String =
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
            .withLocale(Locale.getDefault())
            .format(Instant.ofEpochMilli(millis).atZone(zone).toLocalDate())

    fun refresh() {
        viewModelScope.launch {
            // Sans token → mode local : on ne tient pas de GET /files/folders.
            if (tokenProvider.current == null) {
                Timber.d("folders: pas de token, rafraîchissement serveur ignoré")
                return@launch
            }
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            runCatching { folderRepository.refreshFromServer() }
                .onFailure { e ->
                    val error = when {
                        e is ApiException && e.code == "UNAUTHORIZED" -> "AUTH_REQUIRED"
                        else -> e.message ?: "Erreur réseau"
                    }
                    _uiState.update { it.copy(error = error) }
                }
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    /** Sélectionne un dossier SAF, le persiste puis explore récursivement. */
    fun savePickedFolder(uri: String, name: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, error = null) }
            runCatching {
                val saved = folderRepository.saveFolder(
                    SaveFolderInput(uri = uri, name = name, exists = true),
                )
                val result = deviceSync.syncRoot(saved.resourceId)
                Timber.d("syncRoot %s", result)
            }.onFailure { e ->
                Timber.w(e, "syncRoot failed")
                _uiState.update { it.copy(error = e.message ?: "Erreur lors de l'ajout du dossier") }
            }
            _uiState.update { it.copy(isScanning = false) }
        }
    }
}