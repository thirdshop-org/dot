package com.vaultdrop.mobile.features.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Boucle de fond : explore périodiquement toutes les racines SAF via
 * [DeviceSync.syncAll] — miroir de `useSyncDevice(30_000)` côté Expo.
 *
 * Garanties :
 *  - l'exploration est sur `Dispatchers.IO` et sérialisée par le Mutex de
 *    [DeviceSync] : jamais deux walks en parallèle, jamais de blocage UI ;
 *  - un échec n'interrompt pas la boucle (retry au tick suivant) ;
 *  - le scope du ViewModel arrête la boucle (cancel) à la destruction du
 *    store → le walk en cours s'arrête via `ensureActive()` du scanner.
 */
@HiltViewModel
class SyncViewModel @Inject constructor(
    private val deviceSync: DeviceSync,
) : ViewModel() {

    private var loopJob: Job? = null

    /** Démarre la boucle une seule fois (idempotent). */
    fun ensureStarted() {
        if (loopJob?.isActive == true) return
        loopJob = viewModelScope.launch {
            // Premier cycle différé : laisser le boot et le premier écran
            // répondre avant de lancer un walk potentiellement long.
            delay(FIRST_DELAY_MS)
            while (isActive) {
                runCatching { deviceSync.syncAll() }
                    .onSuccess { results ->
                        if (results.isNotEmpty()) Timber.d("syncAll: %s", results)
                    }
                    .onFailure { e -> Timber.w(e, "syncAll failed, retrying later") }
                delay(INTERVAL_MS)
            }
        }
    }

    companion object {
        /** Cadence de la boucle — même valeur que `useSyncDevice(30_000)` Expo. */
        const val INTERVAL_MS = 30_000L
        /** Délai avant le premier cycle (au démarrage de l'app). */
        const val FIRST_DELAY_MS = 2_000L
    }
}