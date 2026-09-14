package com.vaultdrop.mobile.data.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.dao.FolderDao
import com.vaultdrop.mobile.data.local.dao.PendingOperationDao
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationType
import com.vaultdrop.mobile.data.local.entity.PendingOpStatus
import com.vaultdrop.mobile.data.remote.ApiClient
import com.vaultdrop.mobile.data.remote.ApiService
import com.vaultdrop.mobile.data.remote.dto.ApiEnvelope
import com.vaultdrop.mobile.data.remote.dto.DeviceRegistrationDto
import com.vaultdrop.mobile.data.remote.dto.FileDto
import com.vaultdrop.mobile.data.remote.dto.FolderDto
import com.vaultdrop.mobile.data.remote.dto.LoginRequestDto
import com.vaultdrop.mobile.data.remote.dto.LoginResponseDto
import com.vaultdrop.mobile.data.remote.dto.ResolvedUserDto
import com.vaultdrop.mobile.data.remote.dto.ResourcePermissionDto
import com.vaultdrop.mobile.data.remote.dto.SyncOpsRequest
import com.vaultdrop.mobile.data.remote.dto.SyncOpsResult
import com.vaultdrop.mobile.domain.DeviceIdentity
import com.vaultdrop.mobile.domain.GenerateId
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

/**
 * Garde-fous data-layer de la fusion de dossiers : le re-parentage repositionne
 * les sous-dossiers et journalise un `move_resource` par dossier (ordre outbox),
 * et le garde `delete_resource` reconnaît les dossiers poussés (`resource_type =
 * 'folder'`) via `hasCreateOperationAnyType`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FolderMergeDataTest {

    private lateinit var db: AppDatabase
    private lateinit var folderDao: FolderDao
    private lateinit var opsDao: PendingOperationDao
    private lateinit var folderRepository: FolderRepository
    private lateinit var outboxRepository: OutboxRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        folderDao = db.folderDao()
        opsDao = db.pendingOperationDao()

        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val generateId = GenerateId()
        val deviceIdentity = DeviceIdentity(db.userPreferenceDao(), generateId)
        outboxRepository = OutboxRepository(opsDao, generateId, moshi)
        folderRepository = FolderRepository(
            folderDao = folderDao,
            apiClient = ApiClient(FolderMergeApiService(), moshi),
            generateId = generateId,
            deviceIdentity = deviceIdentity,
            appDatabase = db,
            outboxRepository = outboxRepository,
        )
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun reparent_repositionne_les_sous_dossiers_et_enqueue_move_resource_par_dossier() = runTest {
        folderDao.upsert(folder(ROOT, parent = null))
        folderDao.upsert(folder(CHILD_A, parent = ROOT))
        folderDao.upsert(folder(CHILD_B, parent = ROOT))

        folderRepository.reparentSubFolders(listOf(CHILD_A, CHILD_B), MERGED)

        assertEquals("parent_A repositionné", MERGED, folderDao.getByResourceId(CHILD_A)!!.parentResourceId)
        assertEquals("parent_B repositionné", MERGED, folderDao.getByResourceId(CHILD_B)!!.parentResourceId)

        val ops = opsDao.selectPending(10)
        assertEquals("une op move par dossier (ordre outbox)", 2, ops.size)
        assertEquals(PendingOperationType.MOVE_RESOURCE, ops[0].operation)
        assertEquals("folder", ops[0].resourceType)
        assertEquals(CHILD_A, ops[0].resourceId)
        assertEquals(ROOT_WITH_MERGED, ops[0].payload)
        assertEquals(PendingOperationType.MOVE_RESOURCE, ops[1].operation)
        assertEquals(CHILD_B, ops[1].resourceId)
        assertEquals(PendingOpStatus.PENDING, ops[1].status)
    }

    @Test
    fun reparent_expose_les_enfants_au_nouveau_parent() = runTest {
        folderDao.upsert(folder(ROOT, parent = null))
        folderDao.upsert(folder(CHILD_A, parent = ROOT))
        folderDao.upsert(folder(CHILD_B, parent = ROOT))
        // L'ancien parent n'a plus d'enfants visibles.
        assertEquals(2, folderRepository.getChildren(ROOT).size)

        folderRepository.reparentSubFolders(listOf(CHILD_A, CHILD_B), MERGED)

        assertEquals(listOf(CHILD_A, CHILD_B), folderRepository.getChildren(MERGED).map { it.resourceId })
        assertEquals("l'ancien parent est vide", 0, folderRepository.getChildren(ROOT).size)
    }

    @Test
    fun reparent_vide_est_un_noop() = runTest {
        folderRepository.reparentSubFolders(emptyList(), MERGED)
        assertEquals(0, opsDao.selectPending(10).size)
    }

    @Test
    fun hasCreateOperationAnyType_reconnait_les_dossiers_pousses() = runTest {
        opsDao.insert(
            PendingOperationEntity(
                operationId = "1".repeat(32),
                resourceId = FOLDER_ID,
                resourceType = "folder",
                operation = PendingOperationType.CREATE_RESOURCE,
                payload = "{}",
                status = PendingOpStatus.PENDING,
                createdAt = NOW,
                updatedAt = NOW,
            ),
        )

        assertFalse(
            "le gate « processed » (fichiers) reste scindé sur resource_type = 'file'",
            outboxRepository.hasCreateOperation(FOLDER_ID),
        )
        assertTrue(
            "un delete_resource peut être émis pour un dossier déjà poussé",
            outboxRepository.hasCreateOperationAnyType(FOLDER_ID),
        )
    }

    // --- fixtures ------------------------------------------------------------

    private fun folder(resourceId: String, parent: String?) = FolderEntity(
        resourceId = resourceId,
        uri = null,
        name = resourceId,
        exists = 1,
        parentResourceId = parent,
        ownerId = OWNER,
        syncStatus = "cloud",
        addedAt = NOW,
        updatedAt = NOW,
    )

    private companion object {
        const val NOW = 1_700_000_000_000L
        const val ROOT = "11111111111111111111111111111111"
        const val CHILD_A = "22222222222222222222222222222222"
        const val CHILD_B = "33333333333333333333333333333333"
        const val MERGED = "44444444444444444444444444444444"
        const val OWNER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        const val FOLDER_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        val ROOT_WITH_MERGED = """{"toFolderResourceId":"$MERGED"}"""
    }
}

/** Fake `ApiService` — aucun endpoint n'est consommé par `reparentSubFolders`. */
private class FolderMergeApiService : ApiService {
    override suspend fun listFolders(): Response<ApiEnvelope<List<FolderDto>>> =
        Response.success(ApiEnvelope(data = emptyList()))

    override suspend fun listFiles(
        folderId: String?,
        page: Int?,
        pageSize: Int?,
    ): Response<ApiEnvelope<List<FileDto>>> = Response.success(ApiEnvelope(data = emptyList()))

    override suspend fun registerDevice(
        body: DeviceRegistrationDto,
    ): Response<ApiEnvelope<DeviceRegistrationDto>> = Response.success(ApiEnvelope(data = body))

    override suspend fun login(
        body: LoginRequestDto,
    ): Response<ApiEnvelope<LoginResponseDto>> = Response.success(ApiEnvelope())

    override suspend fun syncOps(
        body: SyncOpsRequest,
    ): Response<ApiEnvelope<SyncOpsResult>> = Response.success(ApiEnvelope(data = SyncOpsResult(applied = 0)))

    override suspend fun resolveUser(
        username: String,
    ): Response<ApiEnvelope<ResolvedUserDto>> = Response.success(ApiEnvelope())

    override suspend fun syncPermissions(
        after: Long?,
    ): Response<ApiEnvelope<List<ResourcePermissionDto>>> =
        Response.success(ApiEnvelope(data = emptyList()))
}