package com.vaultdrop.mobile.data.local.dao

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationType
import com.vaultdrop.mobile.data.local.entity.PendingOpStatus
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.ApiService
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.OutboxRepository
import com.vaultdrop.mobile.data.repository.SaveFileInput
import com.vaultdrop.mobile.domain.GenerateId
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

/**
 * Contrat du gate « processed » — un fichier SAF n'est poussé vers le serveur
 * (`create_resource` dans l'outbox) qu'une fois « gardé » :
 *  - ingestion SAF (`processed = false`) → importé localement, **aucune** op ;
 *  - scan export (`processed = true`) → poussé immédiatement ;
 *  - `markProcessed` (garder) → enqueue, idempotent (jamais deux fois) ;
 *  - `markAllProcessed` (échappatoire) → enqueue pour chaque fichier ;
 *  - `hasCreateOperation` discrimine pending/synced (vrai) vs absent/failed (faux).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProcessedGateTest {

    private lateinit var db: AppDatabase
    private lateinit var fileDao: FileDao
    private lateinit var opsDao: PendingOperationDao
    private lateinit var fileRepository: FileRepository
    private lateinit var outboxRepository: OutboxRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        fileDao = db.fileDao()
        opsDao = db.pendingOperationDao()

        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val apiService = Retrofit.Builder()
            .baseUrl("http://localhost:1/")
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(ApiService::class.java)
        val apiClient = ApiClient(apiService, moshi)
        val generateId = GenerateId()

        outboxRepository = OutboxRepository(opsDao, generateId, moshi)
        fileRepository = FileRepository(fileDao, apiClient, generateId, db, outboxRepository)
    }

    @After
    fun tearDown() {
        db.close()
    }

    // --- ingestion -----------------------------------------------------------

    @Test
    fun nouveau_fichier_saf_non_traite_aucune_op_enqueue() = runTest {
        saveLocal(processed = false, uri = FILE_URI)

        val ops = opsDao.selectPending(20)
        assertTrue("un fichier SAF non traité ne doit rien pousser", ops.isEmpty())
        val file = fileDao.getByUri(FILE_URI)!!
        assertEquals(false, file.processed)
    }

    @Test
    fun fichier_scan_deja_traite_pousse_immediatement() = runTest {
        saveLocal(processed = true)

        val ops = opsDao.selectPending(20)
        assertEquals(1, ops.size)
        assertEquals(PendingOperationType.CREATE_RESOURCE, ops[0].operation)
        assertEquals("file", ops[0].resourceType)
    }

    // --- garder (markProcessed) ---------------------------------------------

    @Test
    fun garder_enqueue_create_resource_une_seule_fois() = runTest {
        saveLocal(processed = false, uri = FILE_URI)
        val file = fileDao.getByUri(FILE_URI)!!

        fileRepository.markProcessed(file.resourceId)
        assertEquals(1, selectOps(file.resourceId).size)
        assertEquals(true, fileDao.getByResourceId(file.resourceId)!!.processed)

        // Idempotent : re-garder (double tap) ne re-enqueue pas.
        fileRepository.markProcessed(file.resourceId)
        assertEquals(1, selectOps(file.resourceId).size)
    }

    @Test
    fun garder_un_fichier_deja_pousse_ne_re_enqueue_pas() = runTest {
        // Fichier scan (déjà `processed`, create déjà enqueue à l'ingestion).
        saveLocal(processed = true)
        val file = fileDao.getByResourceId(RESOURCE_ID)!!
        assertEquals(1, selectOps(file.resourceId).size)

        fileRepository.markProcessed(file.resourceId)
        assertEquals(1, selectOps(file.resourceId).size)
    }

    // --- tout marquer (markAllProcessed) ------------------------------------

    @Test
    fun tout_marquer_enqueue_un_create_par_fichier() = runTest {
        saveLocal(processed = false, uri = "content://tree/f1", resourceId = "a".repeat(32))
        saveLocal(processed = false, uri = "content://tree/f2", resourceId = "b".repeat(32))

        fileRepository.markAllProcessed()

        assertEquals(1, selectOps("a".repeat(32)).size)
        assertEquals(1, selectOps("b".repeat(32)).size)
        assertEquals(true, fileDao.getByResourceId("a".repeat(32))!!.processed)
        assertEquals(true, fileDao.getByResourceId("b".repeat(32))!!.processed)
    }

    // --- hasCreateOperation --------------------------------------------------

    @Test
    fun hasCreateOperation_discrimine_pending_synced_absent_failed() = runTest {
        val pending = "0".repeat(32)
        val synced = "1".repeat(32)
        val failed = "2".repeat(32)

        opsDao.insert(op(resourceId = pending, operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.PENDING))
        opsDao.insert(op(resourceId = synced, operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.SYNCED))
        opsDao.insert(op(resourceId = failed, operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.FAILED))

        assertTrue(outboxRepository.hasCreateOperation(pending))
        assertTrue(outboxRepository.hasCreateOperation(synced))
        assertEquals(false, outboxRepository.hasCreateOperation(failed))
        assertEquals(false, outboxRepository.hasCreateOperation("9".repeat(32)))
    }

    @Test
    fun un_delete_resource_ne_compte_pas_comme_create() = runTest {
        opsDao.insert(op(resourceId = RESOURCE_ID, operation = PendingOperationType.DELETE_RESOURCE, status = PendingOpStatus.SYNCED))
        assertEquals(false, outboxRepository.hasCreateOperation(RESOURCE_ID))
    }

    // --- fixtures ------------------------------------------------------------

    private fun saveLocal(processed: Boolean, uri: String = "content://tree/file", resourceId: String = RESOURCE_ID) {
        runBlockingSafe {
            fileRepository.saveLocalFile(
                input = SaveFileInput(
                    uri = uri,
                    name = "$resourceId.txt",
                    extension = "txt",
                    size = 1024,
                    mimeType = "text/plain",
                    resourceId = resourceId,
                    processed = processed,
                ),
                folderResourceId = FOLDER,
            )
        }
    }

    private fun selectOps(resourceId: String): List<PendingOperationEntity> =
        runBlockingSafe { opsDao.selectPending(100) }.filter { it.resourceId == resourceId }

    private fun op(
        resourceId: String,
        operation: String,
        status: String,
    ) = PendingOperationEntity(
        operationId = operationIdSeq.format(),
        resourceId = resourceId,
        resourceType = "file",
        operation = operation,
        payload = "{}",
        status = status,
        createdAt = NOW,
        updatedAt = NOW,
    )

    private var opSeq = 0
    private val operationIdSeq: String get() = String.format("%032x", opSeq++)
    private fun <T> runBlockingSafe(block: suspend () -> T): T = kotlinx.coroutines.runBlocking { block() }

    private companion object {
        const val NOW = 1_700_000_000_000L
        const val FOLDER = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"
        const val RESOURCE_ID = "aabbccddeeff11223344556677889900"
        const val FILE_URI = "content://tree/aabbccddeeff11223344556677889900"
    }
}