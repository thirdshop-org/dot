package com.vaultdrop.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.vaultdrop.mobile.data.local.entity.ScanPageEntity
import com.vaultdrop.mobile.data.local.entity.ScanSessionEntity
import kotlinx.coroutines.flow.Flow

/** Persistance des sessions de scan (appareil photo) — local uniquement. */
@Dao
interface ScanDao {

    @Insert
    suspend fun insertSession(session: ScanSessionEntity): Long

    @Query("SELECT * FROM scan_sessions WHERE id = :sessionId")
    suspend fun getSession(sessionId: Long): ScanSessionEntity?

    @Query("SELECT * FROM scan_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1")
    suspend fun getActiveSession(): ScanSessionEntity?

    @Query("UPDATE scan_sessions SET status = :status, updated_at = :now WHERE id = :sessionId")
    suspend fun updateStatus(sessionId: Long, status: String, now: Long)

    @Query("UPDATE scan_sessions SET root_folder_id = :rootFolderId, updated_at = :now WHERE id = :sessionId")
    suspend fun updateRootFolder(sessionId: Long, rootFolderId: String, now: Long)

    @Insert
    suspend fun insertPage(page: ScanPageEntity): Long

    @Update
    suspend fun updatePage(page: ScanPageEntity)

    @Query("SELECT * FROM scan_pages WHERE session_id = :sessionId ORDER BY sort_order ASC")
    fun observePages(sessionId: Long): Flow<List<ScanPageEntity>>

    @Query("SELECT * FROM scan_pages WHERE session_id = :sessionId ORDER BY sort_order ASC")
    suspend fun getPages(sessionId: Long): List<ScanPageEntity>

    @Query("SELECT * FROM scan_pages WHERE id = :pageId")
    suspend fun getPage(pageId: Long): ScanPageEntity?

    @Query("DELETE FROM scan_pages WHERE id = :pageId AND session_id = :sessionId")
    suspend fun deletePage(pageId: Long, sessionId: Long)

    @Query(
        """
        UPDATE scan_pages SET sort_order = CASE id
            WHEN :firstId THEN :secondOrder
            WHEN :secondId THEN :firstOrder
            ELSE sort_order END
        WHERE session_id = :sessionId
        """,
    )
    suspend fun swapOrder(sessionId: Long, firstId: Long, secondId: Long, firstOrder: Int, secondOrder: Int)

    @Query("SELECT COUNT(*) FROM scan_pages WHERE session_id = :sessionId")
    fun observePageCount(sessionId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM scan_pages WHERE session_id = :sessionId")
    suspend fun pageCount(sessionId: Long): Int
}