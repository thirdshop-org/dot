package com.vaultdrop.mobile.data.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.dao.PendingOperationDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
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
 * Garde-fous outbox du déplacement local : tant qu'un `move_resource` est en
 * attente de push, ni le refresh serveur ni le walk SAF ne doivent écraser le
 * placement local (`folder_resource_id`) ou masquer la ligne. Une fois l'op
 * `synced` (ou jamais journalisée), le serveur / le walk redevient source de
 * vérité. Et la réconciliation ne doit jamais pairer un `markMissing`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MoveProtectionTest {

    private lateinit var db: AppDatabase
    private lateinit var fileDao: FileDao
    private lateinit var opsDao: PendingOperationDao
    private lateinit var fileRepository: FileRepository
    private lateinit var outboxRepository: OutboxRepository
    private lateinit var apiService: MoveProtectionApiService

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        fileDao = db.fileDao()
        opsDao = db.pendingOperationDao()

        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        apiService = MoveProtectionApiService()
        val apiClient = ApiClient(apiService, moshi)
        val generateId = GenerateId()

        outboxRepository = OutboxRepository(opsDao, generateId, moshi)
        fileRepository = FileRepository(fileDao, apiClient, generateId, db, outboxRepository)
    }

    @After
    fun tearDown() {
        db.close()
    }

    // --- refreshFromServer : le move en attente prime sur le serveur ---------

    @Test
    fun refresh_serveur_ne_reenvoie_pas_le_fichier_a_son_ancien_dossier_si_move_pending() = runTest {
        // Placement local : le fichier est déjà dans le dossier cible TARGET.
        fileDao.upsert(file(TARGET_FOLDER, exists = 1))
        // L'op move_resource n'a pas encore été poussée.
        opsDao.insert(op(status = PendingOpStatus.PENDING))
        // Le serveur renvoie encore l'ancien dossier (op pas appliquée).
        apiService.files = listOf(
            FileDto(id = FILE_ID, name = NAME, size = SIZE, mimeType = MIME, folderId = SOURCE_FOLDER),
        )

        fileRepository.refreshFromServer(SOURCE_FOLDER)

        val row = fileDao.getByResourceId(FILE_ID)!!
        assertEquals("placement local cible préservé", TARGET_FOLDER, row.folderResourceId)
        assertEquals("ligne jamais masquée", 1, row.exists)
    }

    @Test
    fun refresh_serveur_applique_la_position_une_fois_move_synced() = runTest {
        // L'op a été appliquée côté serveur — le serveur redevient source de
        // vérité (la ligne se ré-attribue au dossier renvoyé).
        fileDao.upsert(file(TARGET_FOLDER, exists = 1))
        opsDao.insert(op(status = PendingOpStatus.SYNCED))
        apiService.files = listOf(
            FileDto(id = FILE_ID, name = NAME, size = SIZE, mimeType = MIME, folderId = SOURCE_FOLDER),
        )

        fileRepository.refreshFromServer(SOURCE_FOLDER)

        val row = fileDao.getByResourceId(FILE_ID)!!
        assertEquals(SOURCE_FOLDER, row.folderResourceId)
    }

    @Test
    fun refresh_sans_op_outbox_suit_le_serveur() = runTest {
        // Aucun move jamais journalisé → suivi serveur direct.
        fileDao.upsert(file(SOURCE_FOLDER, exists = 1))
        apiService.files = listOf(
            FileDto(id = FILE_ID, name = NAME_DIFF, size = SIZE, mimeType = MIME, folderId = SOURCE_FOLDER),
        )

        fileRepository.refreshFromServer(SOURCE_FOLDER)

        val row = fileDao.getByResourceId(FILE_ID)!!
        assertEquals("métadonnées serveur prises en compte", NAME_DIFF, row.name)
        assertEquals(SOURCE_FOLDER, row.folderResourceId)
    }

    // --- saveLocalFile : le walk SAF ne doit pas ré-attribuer le dossier -----

    @Test
    fun walk_saf_ne_reenvoie_pas_le_fichier_dans_l_ancien_dossier_si_move_pending() = runTest {
        // Repli métadonnée seule : le fichier est physiquement resté dans
        // l'ancien dossier (uri inchangé) mais Room/en cours = dossier cible.
        fileDao.upsert(file(TARGET_FOLDER, exists = 1).copy(uri = PRE_MOVE_URI))
        opsDao.insert(op(status = PendingOpStatus.PENDING))

        // Le walk retrouve le fichier à son emplacement physique (ancien
        // dossier) : il ne doit pas ré-attribuer le placement cible.
        fileRepository.saveLocalFile(
            input = SaveFileInput(
                uri = PRE_MOVE_URI,
                name = NAME,
                extension = "txt",
                size = SIZE,
                mimeType = MIME,
                lastModified = 123L,
                exists = true,
            ),
            folderResourceId = SOURCE_FOLDER,
        )

        val row = fileDao.getByResourceId(FILE_ID)!!
        assertEquals("le walk ne doit pas ré-attribuer le dossier", TARGET_FOLDER, row.folderResourceId)
    }

    @Test
    fun walk_saf_reenvoie_le_fichier_dans_son_dossier_physique_sans_op_outbox() = runTest {
        // Pas de move jamais journalisé : le walk est la référence physique.
        fileDao.upsert(file(TARGET_FOLDER, exists = 0).copy(uri = PRE_MOVE_URI))

        fileRepository.saveLocalFile(
            input = SaveFileInput(
                uri = PRE_MOVE_URI,
                name = NAME,
                extension = "txt",
                size = SIZE,
                mimeType = MIME,
                lastModified = 123L,
                exists = true,
            ),
            folderResourceId = SOURCE_FOLDER,
        )

        val row = fileDao.getByResourceId(FILE_ID)!!
        assertEquals(SOURCE_FOLDER, row.folderResourceId)
        assertEquals("la ligne émerge à nouveau", 1, row.exists)
    }

    // --- prédicats outbox ----------------------------------------------------

    @Test
    fun hasPendingMoveOperation_discrimine_pending_seul() = runTest {
        opsDao.insert(op(status = PendingOpStatus.PENDING))
        assertTrue(outboxRepository.hasPendingMoveOperation(FILE_ID))
    }

    @Test
    fun hasPendingMoveOperation_faux_quand_synced_absent_failed() = runTest {
        opsDao.insert(op(status = PendingOpStatus.SYNCED))
        assertTrue("synced compte comme move (transition)", outboxRepository.hasMoveOperation(FILE_ID))
        assertFalse(outboxRepository.hasPendingMoveOperation(FILE_ID))

        opsDao.insert(
            op(status = PendingOpStatus.FAILED, resourceId = "9".repeat(32)),
        )
        assertFalse(outboxRepository.hasPendingMoveOperation("9".repeat(32)))
        assertFalse(outboxRepository.hasMoveOperation("9".repeat(32)))
    }

    @Test
    fun un_autre_type_d_op_ne_compte_pas_comme_move() = runTest {
        opsDao.insert(
            op(status = PendingOpStatus.PENDING, operation = PendingOperationType.CREATE_RESOURCE, resourceId = "8".repeat(32)),
        )
        assertFalse(outboxRepository.hasPendingMoveOperation("8".repeat(32)))
        assertFalse(outboxRepository.hasMoveOperation("8".repeat(32)))
    }

    // --- fixtures ------------------------------------------------------------

    private fun file(folderId: String, exists: Int) = FileEntity(
        resourceId = FILE_ID,
        uri = PRE_MOVE_URI,
        name = NAME,
        folderResourceId = folderId,
        extension = "txt",
        size = SIZE,
        mimeType = MIME,
        category = "document",
        exists = exists,
        syncStatus = FileStatus.LOCAL,
        processed = true,
        addedAt = NOW,
        updatedAt = NOW,
    )

    private fun op(
        status: String,
        resourceId: String = FILE_ID,
        operation: String = PendingOperationType.MOVE_RESOURCE,
    ) = PendingOperationEntity(
        operationId = String.format("%032x", opSeq++),
        resourceId = resourceId,
        resourceType = "file",
        operation = operation,
        payload = """{"toFolderResourceId":"$TARGET_FOLDER"}""",
        status = status,
        createdAt = NOW,
        updatedAt = NOW,
    )

    private var opSeq = 0

    private companion object {
        const val NOW = 1_700_000_000_000L
        const val SOURCE_FOLDER = "11111111111111111111111111111111"
        const val TARGET_FOLDER = "22222222222222222222222222222222"
        const val FILE_ID = "aabbccddeeff11223344556677889900"
        const val NAME = "document.txt"
        const val NAME_DIFF = "document_renomme.txt"
        const val SIZE = 1024L
        const val MIME = "text/plain"
        const val PRE_MOVE_URI = "content://tree/11111111111111111111111111111111/doc"
    }
}

/** Fake `ApiService` — seul `listFiles` est réellement consommé. */
private class MoveProtectionApiService : ApiService {
    var files: List<FileDto> = emptyList()

    override suspend fun listFolders(): Response<ApiEnvelope<List<FolderDto>>> =
        Response.success(ApiEnvelope(data = emptyList()))

    override suspend fun listFiles(
        folderId: String?,
        page: Int?,
        pageSize: Int?,
    ): Response<ApiEnvelope<List<FileDto>>> = Response.success(ApiEnvelope(data = files))

    override suspend fun registerDevice(
        body: DeviceRegistrationDto,
    ): Response<ApiEnvelope<DeviceRegistrationDto>> =
        Response.success(ApiEnvelope(data = body))

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