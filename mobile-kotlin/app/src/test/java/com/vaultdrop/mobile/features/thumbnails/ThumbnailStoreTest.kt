package com.vaultdrop.mobile.features.thumbnails

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.vaultdrop.mobile.data.local.entity.FileEntity
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Contrat du ThumbnailStore — les coûts ressources sont bornés par design :
 *  - `inSampleSizeFor` garantit un décodage ≤ 512 px (jamais le full-res) ;
 *  - le cache-hit (`isUpToDate`) ne touche ni ContentResolver ni disque lourd ;
 *  - `ensure` ne génère que pour IMAGE/PDF avec uri (les autres → null, icône) ;
 *  - `delete` purge la vignette d'une ressource supprimée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ThumbnailStoreTest {

    private lateinit var context: Context
    private lateinit var store: ThumbnailStore

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        store = ThumbnailStore(context)
    }

    @Test
    fun inSampleSize_dimensionne_toujours_sous_la_bome() {
        // 12800 × 7200 (12MP) → décodé ≤ 512 px de côté max.
        assertEquals(32, store.inSampleSizeFor(12800, 7200))
        // 4000 × 3000 → 8 → 500 px ≤ 512.
        assertEquals(8, store.inSampleSizeFor(4000, 3000))
        // Petites images : pas de sur-échantillonnage inutile.
        assertEquals(1, store.inSampleSizeFor(400, 300))
        // Dimensions invalides → 1 (aucun downsample défensif).
        assertEquals(1, store.inSampleSizeFor(0, 0))
    }

    @Test
    fun thumbnailFile_nomme_par_resource_id() {
        val id = "a".repeat(32)
        val f = store.thumbnailFile(id)
        assertEquals(
            File(File(context.filesDir, "thumbnails"), "$id.webp").absolutePath,
            f.absolutePath,
        )
    }

    @Test
    fun isUpToDate_absente_faux() {
        assertFalse(store.isUpToDate(store.thumbnailFile("0".repeat(32)), 123L))
    }

    @Test
    fun isUpToDate_plus_recente_que_la_source_vrai() {
        val target = store.thumbnailFile("1".repeat(32))
        target.parentFile?.mkdirs()
        target.writeBytes(ByteArray(4))
        assertTrue(target.setLastModified(10_000L))

        assertTrue(store.isUpToDate(target, 10_000L))
        assertTrue(store.isUpToDate(target, 5_000L))
    }

    @Test
    fun isUpToDate_source_plus_recente_faux() {
        val target = store.thumbnailFile("2".repeat(32))
        target.parentFile?.mkdirs()
        target.writeBytes(ByteArray(4))
        assertTrue(target.setLastModified(10_000L))

        assertFalse(store.isUpToDate(target, 20_000L))
    }

    @Test
    fun ensure_sans_uri_retourne_null() {
        val file = fileWith(resourceId = "3".repeat(32), category = "IMAGE", uri = null)
        runTest { assertNull(store.ensure(file)) }
    }

    @Test
    fun ensure_categorie_hors_image_pdf_retourne_null() {
        val file = fileWith(resourceId = "4".repeat(32), category = "TEXT", uri = "content://root/doc")
        runTest { assertNull(store.ensure(file)) }
    }

    @Test
    fun ensure_vignette_en_place_retournee_sans_generation() {
        val resourceId = "5".repeat(32)
        val file = fileWith(
            resourceId = resourceId,
            category = "IMAGE",
            uri = "content://root/doc",
            lastModified = 10_000L,
        )
        val existing = store.thumbnailFile(resourceId)
        existing.parentFile?.mkdirs()
        existing.writeBytes(ByteArray(4))
        existing.setLastModified(20_000L)

        runTest {
            val thumb = store.ensure(file)
            assertEquals(existing.absolutePath, thumb?.absolutePath)
        }
    }

    @Test
    fun delete_purge_la_vignette() {
        val resourceId = "6".repeat(32)
        val target = store.thumbnailFile(resourceId)
        target.parentFile?.mkdirs()
        target.writeBytes(ByteArray(4))
        assertTrue(target.isFile)

        store.delete(resourceId)
        assertFalse(target.exists())
    }

    private fun fileWith(
        resourceId: String,
        category: String?,
        uri: String?,
        lastModified: Long? = null,
    ) = FileEntity(
        resourceId = resourceId,
        name = "doc",
        folderResourceId = "f".repeat(32),
        size = 1L,
        uri = uri,
        category = category,
        lastModified = lastModified,
        addedAt = 0L,
        updatedAt = 0L,
    )
}