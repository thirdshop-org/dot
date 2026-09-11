package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.TextSnippet
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.domain.computeCategory

/** Pictogramme dédié à chaque catégorie de document. */
val FileCategory.icon: ImageVector
    get() = when (this) {
        FileCategory.PDF -> Icons.Filled.PictureAsPdf
        FileCategory.OFFICE -> Icons.Filled.Description
        FileCategory.IMAGE -> Icons.Filled.Image
        FileCategory.TEXT -> Icons.Filled.TextSnippet
        FileCategory.VIDEO -> Icons.Filled.Movie
        FileCategory.AUDIO -> Icons.Filled.MusicNote
        FileCategory.OTHER -> Icons.Filled.InsertDriveFile
    }

/** Teinte dédiée à chaque catégorie de document. */
val FileCategory.color: Color
    get() = when (this) {
        FileCategory.PDF -> Color(0xFFD32F2F)
        FileCategory.OFFICE -> Color(0xFF1565C0)
        FileCategory.IMAGE -> Color(0xFF2E7D32)
        FileCategory.TEXT -> Color(0xFF546E7A)
        FileCategory.VIDEO -> Color(0xFF6A1B9A)
        FileCategory.AUDIO -> Color(0xFFAD1457)
        FileCategory.OTHER -> Color(0xFF757575)
    }

/**
 * Catégorie d'un fichier : valeur stockée (`category`, colonne ajoutée en v4)
 * sinon recalculée depuis le MIME / l'extension — couvre les enregistrements
 * antérieurs où la colonne est NULL.
 */
fun FileEntity.categoryValue(): FileCategory {
    val stored = category?.let { runCatching { FileCategory.valueOf(it) }.getOrNull() }
    return stored ?: computeCategory(mimeType, extension)
}

/** Icône de catégorie d'un fichier — pictogramme + teinte dédiée. */
@Composable
fun FileCategoryIcon(
    file: FileEntity,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val category = file.categoryValue()
    Icon(
        imageVector = category.icon,
        contentDescription = null,
        tint = category.color,
        modifier = modifier.size(size),
    )
}