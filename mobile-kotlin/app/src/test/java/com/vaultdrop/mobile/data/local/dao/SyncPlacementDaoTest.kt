package com.vaultdrop.mobile.data.local.dao

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.local.entity.FolderStatus
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.data.local.entity.PendingOperationType
import com.vaultdrop.mobile.data.local.entity.PendingOpStatus
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Garantit le contrat placement `sync_status` du client :
 *  - `promoteSyncStatus` confirme une ressource après `POST /sync/ops` appliqué
 *    (`local-cloud` si copie physique présente, `cloud` sinon) ;
 *  - `backfillSyncedStatus` rattrape les ressources déjà confirmées avant ce
 *    mécanisme, sans toucher aux `local` non confirmées ni aux `failed`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SyncPlacementDaoTest {

    private lateinit var db: AppDatabase
    private lateinit var fileDao: FileDao
    private lateinit var folderDao: FolderDao
    private lateinit var opsDao: PendingOperationDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        fileDao = db.fileDao()
        folderDao = db.folderDao()
        opsDao = db.pendingOperationDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    // --- promoteSyncStatus -------------------------------------------------

    @Test
    fun promote_file_avec_uri_local_cloud_sinon_cloud() = runTest {
        val physical = file("aaaa00000000000000000000000000aa", uri = "content://tree/doc")
        val onlyCloud = file("bbbb00000000000000000000000000bb", uri = null)
        fileDao.upsert(physical)
        fileDao.upsert(onlyCloud)

        fileDao.promoteSyncStatus(physical.resourceId, now())
        fileDao.promoteSyncStatus(onlyCloud.resourceId, now())

        assertEquals(FileStatus.LOCAL_CLOUD, fileDao.getByResourceId(physical.resourceId)!!.syncStatus)
        assertEquals(FileStatus.CLOUD, fileDao.getByResourceId(onlyCloud.resourceId)!!.syncStatus)
    }

    @Test
    fun promote_folder_avec_uri_local_cloud_sinon_cloud() = runTest {
        val physical = folder("cccc00000000000000000000000000cc", uri = "content://tree/root")
        val onlyCloud = folder("dddd00000000000000000000000000dd", uri = null)
        folderDao.upsert(physical)
        folderDao.upsert(onlyCloud)

        folderDao.promoteSyncStatus(physical.resourceId, now())
        folderDao.promoteSyncStatus(onlyCloud.resourceId, now())

        assertEquals(FolderStatus.LOCAL_CLOUD, folderDao.getByResourceId(physical.resourceId)!!.syncStatus)
        assertEquals(FolderStatus.CLOUD, folderDao.getByResourceId(onlyCloud.resourceId)!!.syncStatus)
    }

    @Test
    fun promote_idempotent() = runTest {
        val f = file("eeee00000000000000000000000000ee")
        fileDao.upsert(f)
        fileDao.promoteSyncStatus(f.resourceId, now())
        fileDao.promoteSyncStatus(f.resourceId, now())
        assertEquals(FileStatus.LOCAL_CLOUD, fileDao.getByResourceId(f.resourceId)!!.syncStatus)
    }

    // --- backfillSyncedStatus -----------------------------------------------

    @Test
    fun backfill_promeut_les_fichiers_confirmees_par_un_create_synced() = runTest {
        val confirmed = file("1111")
        val notConfirmed = file("2222")
        val failed = file("3333")
        val deleted = file("4444")
        fileDao.upsert(confirmed)
        fileDao.upsert(notConfirmed)
        fileDao.upsert(failed)
        fileDao.upsert(deleted)

        opsDao.insert(op(resourceId = confirmed.resourceId, type = "file", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.SYNCED))
        opsDao.insert(op(resourceId = notConfirmed.resourceId, type = "file", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.PENDING))
        opsDao.insert(op(resourceId = failed.resourceId, type = "file", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.FAILED))
        opsDao.insert(op(resourceId = deleted.resourceId, type = "file", operation = PendingOperationType.DELETE_RESOURCE, status = PendingOpStatus.SYNCED))

        fileDao.backfillSyncedStatus(now())

        assertEquals(FileStatus.LOCAL_CLOUD, fileDao.getByResourceId(confirmed.resourceId)!!.syncStatus)
        assertEquals(FileStatus.LOCAL, fileDao.getByResourceId(notConfirmed.resourceId)!!.syncStatus)
        assertEquals(FileStatus.LOCAL, fileDao.getByResourceId(failed.resourceId)!!.syncStatus)
        assertEquals(FileStatus.LOCAL, fileDao.getByResourceId(deleted.resourceId)!!.syncStatus)
    }

    @Test
    fun backfill_respecte_le_type_folder_vs_file() = runTest {
        val folder = folder("5555")
        val file = file("6666")
        folderDao.upsert(folder)
        fileDao.upsert(file)

        // Une op synced sur le folder ne promeut pas le file de même resource_id.
        opsDao.insert(op(resourceId = folder.resourceId, type = "folder", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.SYNCED))
        opsDao.insert(op(resourceId = file.resourceId, type = "file", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.SYNCED))

        folderDao.backfillSyncedStatus(now())
        fileDao.backfillSyncedStatus(now())

        assertEquals(FolderStatus.LOCAL_CLOUD, folderDao.getByResourceId(folder.resourceId)!!.syncStatus)
        assertEquals(FileStatus.LOCAL_CLOUD, fileDao.getByResourceId(file.resourceId)!!.syncStatus)
    }

    @Test
    fun backfill_ne_touche_pas_les_lignes_deja_confirmees() = runTest {
        val alreadyCloud = file("7777", syncStatus = FileStatus.CLOUD)
        val alreadyBoth = file("8888", syncStatus = FileStatus.LOCAL_CLOUD)
        fileDao.upsert(alreadyCloud)
        fileDao.upsert(alreadyBoth)
        opsDao.insert(op(resourceId = alreadyCloud.resourceId, type = "file", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.SYNCED))
        opsDao.insert(op(resourceId = alreadyBoth.resourceId, type = "file", operation = PendingOperationType.CREATE_RESOURCE, status = PendingOpStatus.SYNCED))

        fileDao.backfillSyncedStatus(now())

        assertEquals(FileStatus.CLOUD, fileDao.getByResourceId(alreadyCloud.resourceId)!!.syncStatus)
        assertEquals(FileStatus.LOCAL_CLOUD, fileDao.getByResourceId(alreadyBoth.resourceId)!!.syncStatus)
    }

    // --- fixtures ------------------------------------------------------------

    private fun now(): Long = 1_700_000_000_000L

    private var opSeq = 0

    private fun op(
        resourceId: String,
        type: String,
        operation: String,
        status: String,
    ) = PendingOperationEntity(
        operationId = String.format("%032x", opSeq++),
        resourceId = resourceId,
        resourceType = type,
        operation = operation,
        payload = "{}",
        status = status,
        createdAt = now(),
        updatedAt = now(),
    )

    private fun file(
        id: String,
        uri: String? = "content://tree/$id",
        syncStatus: String = FileStatus.LOCAL,
    ) = FileEntity(
        resourceId = id.padEnd(32, '0'),
        uri = uri,
        name = "$id.txt",
        folderResourceId = "00000000000000000000000000000000",
        extension = "txt",
        size = 1,
        mimeType = "text/plain",
        exists = 1,
        syncStatus = syncStatus,
        addedAt = now(),
        updatedAt = now(),
    )

    private fun folder(
        id: String,
        uri: String? = "content://tree/$id",
        syncStatus: String = FolderStatus.LOCAL,
    ) = FolderEntity(
        resourceId = id.padEnd(32, '0'),
        uri = uri,
        name = id,
        exists = 1,
        parentResourceId = null,
        syncStatus = syncStatus,
        addedAt = now(),
        updatedAt = now(),
    )
}