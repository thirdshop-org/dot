package com.vaultdrop.mobile.ui.document.content

import android.content.ContentResolver
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.ui.components.categoryValue

/**
 * Lecteur central d'un document : dispatch par état puis par catégorie.
 *
 * - `content` non null → note créée dans l'app (fichier cloud-only, corps
 *   stocké localement) → lecture texte directe
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

    file.content?.let { note ->
        NoteDocumentViewer(text = note, modifier = modifier)
        return
    }

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

/** Lecture d'une note créée dans l'app — corps stocké en base, pas de flux SAF. */
@Composable
private fun NoteDocumentViewer(
    text: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        SelectionContainer(Modifier.weight(1f)) {
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            ) {
                item {
                    Text(
                        text = text,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}