package com.vaultdrop.mobile.ui.document.content

import android.content.ContentResolver
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.ui.components.categoryValue

/**
 * Lecteur central d'un document : dispatch par état puis par catégorie.
 *
 * - `uri == null` → fichier cloud-only, aucun contenu local
 * - PDF → rendu `PdfRenderer` intégré
 * - IMAGE → rendu Coil intégré
 * - TEXT → lecture texte brut intégrée
 * - OFFICE / VIDEO / AUDIO / OTHER → délégation à une application externe
 */
@Composable
fun DocumentContentViewer(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentResolver: ContentResolver = LocalContext.current.contentResolver

    if (file.uri == null) {
        CloudOnlyPlaceholder(file, modifier)
        return
    }

    when (file.categoryValue()) {
        FileCategory.PDF -> PdfPageViewer(
            file = file,
            contentResolver = contentResolver,
            onOpenExternalFailed = onOpenExternalFailed,
            modifier = modifier,
        )
        FileCategory.IMAGE -> ImageViewer(
            contentResolver = contentResolver,
            uri = file.uri,
            contentDescription = file.name,
            modifier = modifier,
        )
        FileCategory.TEXT -> TextDocumentViewer(
            contentResolver = contentResolver,
            uri = file.uri,
            modifier = modifier,
        )
        else -> ExternalOpenFallback(
            file = file,
            onOpenExternalFailed = onOpenExternalFailed,
            modifier = modifier,
        )
    }
}