package com.vaultdrop.mobile.ui.document.content

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.ui.components.FileCategoryIcon

/**
 * Fichier cloud-only : aucune copie physique sur l'appareil (uri = NULL), le
 * contenu n'est donc pas lisible hors ligne. On montre les métadonnées et un
 * état explicite — pas de bouton de lecture.
 */
@Composable
fun CloudOnlyPlaceholder(
    file: FileEntity,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        FileCategoryIcon(file = file, size = 64.dp)
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.document_cloud_only),
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.document_cloud_only_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}