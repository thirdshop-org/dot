package com.vaultdrop.mobile.features.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.vaultdrop.mobile.auth.TokenProvider
import com.vaultdrop.mobile.data.local.dao.PendingOperationDao
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationType
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.ApiException
import com.vaultdrop.mobile.data.remote.dto.SyncOpDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit
import timber.log.Timber

/**
 * Worker de push de l'outbox : applique les batchs `pending_operations` vers
 * `POST /sync/ops`, séquentiellement et dans l'ordre d'entrée en file.
 *
 * Garanties :
 *  - **single-flight** : enregistré via `enqueueUniqueWork(KEEP)` — jamais deux
 *    workers parallèles (ordonnancement chronologique préservé) ;
 *  - **no-op sans token** : mode local, rien à pousser (contrat syncOutbox) ;
 *  - **retry transient** : `NETWORK_ERROR`/5xx/timeout → `Result.retry()`
 *    (backoff exponentiel) sans bump du compteur d'attempts ;
 *  - **dead-letter permanent** : erreur 4xx non-idempotente → op passée en
 *    `failed` immédiatement (évite d'affamer la queue : le serveur s'arrête à
 *    la 1re erreur), et cascade si `create_resource` a échoué (toutes les ops
 *    filles en attente sur la même resource passent `failed`) ;
 *  - `attempts` est un compteur diagnostic (incrémenté à chaque dead-letter),
 *    pas un seuil : une op `failed` n'est plus resélectionnée.
 *  - push **avant** pull : le pull `GET /sync/permissions` (V2) s'appliquera
 *    après ce worker — jamais d'écrasement d'état optimiste.
 */
@HiltWorker
class OutboxSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val apiClient: ApiClient,
    private val pendingOperationDao: PendingOperationDao,
    private val tokenProvider: TokenProvider,
    moshi: Moshi,
) : CoroutineWorker(appContext, workerParams) {

    private val payloadAdapter: JsonAdapter<Map<String, Any?>> = moshi.adapter(
        Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java),
    )

    override suspend fun doWork(): Result {
        // Mode local : sans compte connecté, rien à pousser.
        if (tokenProvider.current == null) return Result.success()

        while (true) {
            val pending = pendingOperationDao.selectPending(BATCH_SIZE)
            if (pending.isEmpty()) {
                pendingOperationDao.purgeSynced(System.currentTimeMillis() - PURGE_AGE_MS)
                return Result.success()
            }

            val ops = pending.map { it.toSyncOpDto() }
            val result = try {
                apiClient.syncOps(ops)
            } catch (e: ApiException) {
                when {
                    e.code == "NETWORK_ERROR" || e.httpCode >= 500 -> {
                        // Transitoire : on retentera avec backoff, sans bump d'attempts.
                        return Result.retry()
                    }
                    e.httpCode == 401 -> {
                        // Token expiré/révoqué : le re-login se fera via l'UI.
                        return Result.success()
                    }
                    else -> {
                        // Erreur permanente : dead-letter la 1re op du batch.
                        val now = System.currentTimeMillis()
                        pendingOperationDao.markFailed(pending.first().id, now)
                        continue
                    }
                }
            }

            val now = System.currentTimeMillis()
            // Ops appliquées par le serveur (indices < applied).
            for (i in 0 until result.applied) {
                pendingOperationDao.markSynced(pending[i].id, now)
                Timber.d("outbox synced %s", pending[i].operationId)
            }

            // Première erreur non-idempotente → dead-letter + cascade éventuelle.
            result.failed?.let { fail ->
                val failedIndex = pending.indexOfFirst { it.operationId == fail.operationId }
                if (failedIndex >= 0) {
                    val failedOp = pending[failedIndex]
                    pendingOperationDao.markFailed(failedOp.id, now)
                    Timber.w("outbox failed %s (%s: %s)", fail.operationId, fail.code, fail.message)
                    if (failedOp.operation == PendingOperationType.CREATE_RESOURCE) {
                        failedOp.resourceId?.let { resourceId ->
                            pendingOperationDao.failDescendants(resourceId, now)
                        }
                    }
                }
            }

            // Boucle : d'autres batchs attendent → traité dans le même run.
        }
    }

    private fun PendingOperationEntity.toSyncOpDto(): SyncOpDto {
        val payloadMap = runCatching { payloadAdapter.fromJson(payload) }.getOrNull()
        return SyncOpDto(
            operationId = operationId,
            refType = refType,
            refId = refId,
            resourceId = resourceId,
            resourceType = resourceType,
            operation = operation,
            payload = payloadMap,
        )
    }

    companion object {
        const val NAME = "outbox_sync"
        private const val BATCH_SIZE = 20
        private const val PURGE_AGE_MS = 7 * 24 * 60 * 60 * 1000L

        /**
         * Enregistre (idempotent) le worker avec contrainte réseau + backoff.
         * `KEEP` : si un run est déjà planifié/en cours, on ne le remplace pas —
         * single-flight garanti.
         */
        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<OutboxSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, request)
        }
    }
}