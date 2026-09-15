package com.vaultdrop.mobile.ui.components

import android.content.Context
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.features.thumbnails.ThumbnailStore
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Vignette réelle d'un document dans les listes (accueil + dossiers).
 *
 * Images (JPEG/PNG/WebP) et PDF (page 1) n'affichent plus une simple icône :
 * la vignette est générée à la demande par [ThumbnailStore] (décodage borné
 * 512 px, single-flight, cache disque `filesDir/thumbnails`) puis rendue par
 * Coil depuis le fichier local — zéro lecture SAF au scroll. Les autres
 * catégories et les fichiers cloud-only conservent l'icône de catégorie.
 */
@Composable
fun FileThumbnail(
    file: FileEntity,
    size: Dp,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(8.dp),
) {
    val category = file.categoryValue()
    if (category != FileCategory.IMAGE && category != FileCategory.PDF) {
        FileCategoryIcon(file = file, size = size, modifier = modifier)
        return
    }

    val context = LocalContext.current
    val thumbnailStore = rememberThumbnailStore(context)
    @Suppress("ProduceStateDoesNotAssignValue")
    val thumb by produceState<File?>(null, file.resourceId, file.lastModified) {
        value = withContext(Dispatchers.IO) { thumbnailStore.ensure(file) }
    }

    val thumbFile = thumb
    if (thumbFile == null) {
        FileCategoryIcon(file = file, size = size, modifier = modifier)
        return
    }

    val sizePx = (size.value * context.resources.displayMetrics.density).toInt()
    AsyncImage(
        model = ImageRequest.Builder(context)
            .data(thumbFile)
            .size(sizePx)
            .build(),
        contentDescription = file.name,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(size)
            .clip(shape),
    )
}

@Composable
private fun rememberThumbnailStore(context: Context): ThumbnailStore =
    remember(context) {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            ThumbnailStoreEntryPoint::class.java,
        ).thumbnailStore()
    }

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface ThumbnailStoreEntryPoint {
    fun thumbnailStore(): ThumbnailStore
}