package com.vaultdrop.mobile.ui.document

import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.features.saf.FileDeleter
import org.junit.Assert.assertEquals
import org.junit.Test

class DeleteModesForTest {

    @Test
    fun local_offre_uniquement_la_suppression_local() {
        assertEquals(
            listOf(FileDeleter.DeleteMode.LOCALLY),
            deleteModesFor(file(syncStatus = FileStatus.LOCAL)),
        )
    }

    @Test
    fun cloud_offre_uniquement_la_suppression_cloud() {
        assertEquals(
            listOf(FileDeleter.DeleteMode.IN_CLOUD),
            deleteModesFor(file(syncStatus = FileStatus.CLOUD)),
        )
    }

    @Test
    fun local_cloud_offre_les_trois_modes() {
        assertEquals(
            listOf(
                FileDeleter.DeleteMode.LOCALLY,
                FileDeleter.DeleteMode.IN_CLOUD,
                FileDeleter.DeleteMode.FULL,
            ),
            deleteModesFor(file(syncStatus = FileStatus.LOCAL_CLOUD)),
        )
    }

    @Test
    fun statut_inconnu_ne_propose_aucun_mode() {
        assertEquals(emptyList<FileDeleter.DeleteMode>(), deleteModesFor(file(syncStatus = "inconnu")))
    }

    private fun file(syncStatus: String) = FileEntity(
        resourceId = "0".repeat(32),
        name = "a.pdf",
        folderResourceId = "1".repeat(32),
        size = 1L,
        syncStatus = syncStatus,
        addedAt = 0L,
        updatedAt = 0L,
    )
}