package com.vaultdrop.mobile.data.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.dao.FileDao
import com.vaultdrop.mobile.data.local.dao.FolderDao
import com.vaultdrop.mobile.data.local.dao.UserPreferenceDao
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.local.entity.FolderEntity
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

/**
 * Contrat de l'hydratation du snapshot `GET /sync/permissions` :
 *  - les ressources non-possédées (viewer/commenter/editor) sont importées
 *    cloud-only (`uri = NULL`, `sync_status = "cloud"`) avec name/parentId ;
 *  - une permission `owner` est ignorée (la ressource est déjà connue via le
 *    walk SAF / l'owning) ;
 *  - une copie physique locale (uri non null) n'est jamais écrasée ;
 *  - une ressource cloud-only absente du snapshot est marquée `exists = 0`
 *    (convergence après révocation/expiration).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShareRepositoryTest {

    private lateinit var db: AppDatabase
    private lateinit var folderDao: FolderDao
    private lateinit var fileDao: FileDao
    private lateinit var shareRepository: ShareRepository
    private lateinit var apiService: FakeApiService

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        folderDao = db.folderDao()
        fileDao = db.fileDao()

        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        apiService = FakeApiService()
        val apiClient = ApiClient(apiService, moshi)
        val deviceIdentity = DeviceIdentity(db.userPreferenceDao(), GenerateId())

        shareRepository = ShareRepository(apiClient, db, deviceIdentity)
    }

    @After
    fun tearDown() {
        db.close()
    }

    // --- hydration -----------------------------------------------------------

    @Test
    fun hydrate_importe_dossier_et_fichier_partages_cloud_only() = runTest {
        apiService.permissions = listOf(
            perm(id = FOLDER_ID, type = "folder", access = "editor", name = "Shared Folder", parentId = null),
            perm(id = FILE_ID, type = "file", access = "viewer", name = "shared.pdf", parentId = FOLDER_ID),
        )

        shareRepository.syncSnapshot()

        val folder = folderDao.getByResourceId(FOLDER_ID)!!
        assertEquals("Shared Folder", folder.name)
        assertNull(folder.uri)
        assertEquals(1, folder.exists)
        assertEquals(FileStatus.CLOUD, folder.syncStatus)
        assertEquals(null, folder.parentResourceId)

        val file = fileDao.getByResourceId(FILE_ID)!!
        assertEquals("shared.pdf", file.name)
        assertNull(file.uri)
        assertEquals(1, file.exists)
        assertEquals(FILE_STATUS, file.syncStatus)
        assertEquals(FOLDER_ID, file.folderResourceId)
        assertTrue("un fichier partagé est déjà traité (pas de review)", file.processed)
    }

    @Test
    fun permission_owner_ignoree() = runTest {
        apiService.permissions = listOf(
            perm(id = OWNED_ID, type = "file", access = "owner", name = "mine.pdf", parentId = null),
        )

        shareRepository.syncSnapshot()

        assertNull("la ressource possédée ne doit pas être hydratée", fileDao.getByResourceId(OWNED_ID))
    }

    @Test
    fun copie_locale_preservee() = runTest {
        fileDao.upsert(
            FileEntity(
                resourceId = FILE_ID,
                uri = "content://tree/physical",
                name = "local.pdf",
                folderResourceId = FOLDER_ID,
                size = 1,
                syncStatus = FileStatus.LOCAL_CLOUD,
                processed = false,
                addedAt = NOW,
                updatedAt = NOW,
            ),
        )
        apiService.permissions = listOf(
            perm(id = FILE_ID, type = "file", access = "editor", name = "server_name.pdf", parentId = FOLDER_ID),
        )

        shareRepository.syncSnapshot()

        val file = fileDao.getByResourceId(FILE_ID)!!
        assertEquals("content://tree/physical", file.uri)
        assertEquals(FileStatus.LOCAL_CLOUD, file.syncStatus)
    }

    // --- convergence ---------------------------------------------------------

    @Test
    fun absence_du_snapshot_marque_la_ressource_partagee_disparue() = runTest {
        folderDao.upsert(
            folder(FOLDER_ID, uri = null, ownerId = OTHER_USER),
        )
        apiService.permissions = emptyList()

        shareRepository.syncSnapshot()

        val folder = folderDao.getByResourceId(FOLDER_ID)!!
        assertEquals(0, folder.exists)
        assertNull(folder.uri)
    }

    @Test
    fun ligne_cloud_only_propre_non_touchee_par_convergence() = runTest {
        // Une ligne cloud-only dont `ownerId` est NULL (pas encore typée) ne
        // doit pas être marquée disparue : elle ne correspond pas à une
        // ressource "shared with me".
        folderDao.upsert(
            folder("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", uri = null, ownerId = null),
        )
        apiService.permissions = emptyList()

        shareRepository.syncSnapshot()

        assertEquals(1, folderDao.getByResourceId("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")!!.exists)
    }

    // --- fixtures ------------------------------------------------------------

    private fun perm(id: String, type: String, access: String, name: String, parentId: String?) =
        ResourcePermissionDto(
            resourceId = id.padEnd(32, '0'),
            resourceType = type,
            effectiveAccess = access,
            inherit = true,
            ownerId = OTHER_USER,
            sharedById = OWNER_ID,
            expiresAt = null,
            cachedAt = NOW,
            updatedAt = NOW,
            name = name,
            parentId = parentId?.padEnd(32, '0'),
        )

    private fun folder(id: String, uri: String?, ownerId: String?) = FolderEntity(
        resourceId = id.padEnd(32, '0'),
        uri = uri,
        name = id,
        exists = 1,
        parentResourceId = null,
        ownerId = ownerId,
        syncStatus = if (uri == null) FileStatus.CLOUD else FileStatus.LOCAL,
        addedAt = NOW,
        updatedAt = NOW,
    )

    private companion object {
        const val NOW = 1_700_000_000_000L
        const val OTHER_USER = "11111111111111111111111111111111"
        const val OWNER_ID = "22222222222222222222222222222222"
        const val FOLDER_ID = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"
        const val FILE_ID = "aabbccddeeff11223344556677889900"
        const val OWNED_ID = "99999999999999999999999999999999"
        const val FILE_STATUS = FileStatus.CLOUD
    }
}

/** Fake `ApiService` — uniquement le snapshot est réellement consommé. */
private class FakeApiService : ApiService {
    var permissions: List<ResourcePermissionDto> = emptyList()

    override suspend fun listFolders(): Response<ApiEnvelope<List<FolderDto>>> =
        Response.success(ApiEnvelope(data = emptyList()))

    override suspend fun listFiles(
        folderId: String?,
        page: Int?,
        pageSize: Int?,
    ): Response<ApiEnvelope<List<FileDto>>> = Response.success(ApiEnvelope(data = emptyList()))

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
        Response.success(ApiEnvelope(data = permissions))
}