package com.vaultdrop.mobile.data.repository

import androidx.room.withTransaction
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.dao.ScanDao
import com.vaultdrop.mobile.data.local.entity.ScanPageEntity
import com.vaultdrop.mobile.data.local.entity.ScanPageStatus
import com.vaultdrop.mobile.data.local.entity.ScanSessionEntity
import com.vaultdrop.mobile.data.local.entity.ScanSessionStatus
import com.vaultdrop.mobile.domain.GenerateId
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persistance Room des sessions de scan (appareil photo). Une seule session
 * active à la fois : on reprend la dernière si une session a été interrompue
 * (process death), sinon on en crée une nouvelle.
 */
@Singleton
class ScanRepository @Inject constructor(
    private val appDatabase: AppDatabase,
    private val scanDao: ScanDao,
    private val generateId: GenerateId,
) {

    suspend fun getOrCreateActiveSession(rootFolderId: String?): ScanSessionEntity {
        scanDao.getActiveSession()?.let { return it }
        val now = System.currentTimeMillis()
        val sessionId = scanDao.insertSession(
            ScanSessionEntity(
                resourceId = generateId.newResourceId(),
                rootFolderId = rootFolderId,
                status = ScanSessionStatus.ACTIVE,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return checkNotNull(scanDao.getSession(sessionId))
    }

    suspend fun setRootFolder(sessionId: Long, rootFolderId: String) {
        appDatabase.withTransaction {
            scanDao.updateRootFolder(sessionId, rootFolderId, System.currentTimeMillis())
        }
    }

    fun observePages(sessionId: Long): Flow<List<ScanPageEntity>> = scanDao.observePages(sessionId)

    fun observePageCount(sessionId: Long): Flow<Int> = scanDao.observePageCount(sessionId)

    suspend fun getPages(sessionId: Long): List<ScanPageEntity> = scanDao.getPages(sessionId)

    suspend fun pageCount(sessionId: Long): Int = scanDao.pageCount(sessionId)

    suspend fun addPage(
        session: ScanSessionEntity,
        tempUri: String,
        cornersJson: String,
        width: Int,
        height: Int,
    ): ScanPageEntity {
        val now = System.currentTimeMillis()
        val order = scanDao.pageCount(session.id)
        val page = ScanPageEntity(
            resourceId = generateId.newResourceId(),
            sessionId = session.id,
            tempUri = tempUri,
            cornersJson = cornersJson,
            width = width,
            height = height,
            sortOrder = order,
            status = ScanPageStatus.PENDING,
            createdAt = now,
        )
        scanDao.insertPage(page)
        return page
    }

    suspend fun deletePage(pageId: Long, sessionId: Long) {
        appDatabase.withTransaction {
            scanDao.deletePage(pageId, sessionId)
        }
    }

    suspend fun movePage(sessionId: Long, pages: List<ScanPageEntity>, pageId: Long, delta: Int) {
        val index = pages.indexOfFirst { it.id == pageId }
        val target = index + delta
        if (index < 0 || target !in pages.indices) return
        val first = pages[index]
        val second = pages[target]
        appDatabase.withTransaction {
            scanDao.swapOrder(sessionId, first.id, second.id, second.sortOrder, first.sortOrder)
        }
    }

    suspend fun markPageExported(page: ScanPageEntity) {
        scanDao.updatePage(page.copy(status = ScanPageStatus.EXPORTED))
    }

    suspend fun finishSession(sessionId: Long) {
        scanDao.updateStatus(sessionId, ScanSessionStatus.DONE, System.currentTimeMillis())
    }

    suspend fun abandonSession(sessionId: Long) {
        scanDao.updateStatus(sessionId, ScanSessionStatus.ABANDONED, System.currentTimeMillis())
    }
}