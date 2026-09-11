package com.vaultdrop.mobile.ui.document.content

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.ui.components.FileCategoryIcon

/**
 * Repli pour les formats sans lecteur intégré (OFFICE, VIDÉO, AUDIO, AUTRE) :
 * on délègue la lecture à une application externe via un intent `ACTION_VIEW`
 * avec permission de lecture accordée sur le `content://`.
 */
@Composable
fun ExternalOpenFallback(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
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
            text = file.name,
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.document_open_with_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        ExternalOpenButton(
            file = file,
            onOpenExternalFailed = onOpenExternalFailed,
        )
    }
}

/** Bouton « Ouvrir avec » — déclenche l'intent externe, remonte l'échec. */
@Composable
fun ExternalOpenButton(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Button(
        onClick = {
            if (!openExternally(context, file)) onOpenExternalFailed()
        },
        modifier = modifier,
    ) {
        Text(stringResource(R.string.document_open_with))
    }
}

/** Tente d'ouvrir le fichier dans une application externe. Retourne `false` si aucune. */
fun openExternally(context: Context, file: FileEntity): Boolean {
    val uri = file.uri ?: return false
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(uri), file.mimeType ?: "*/*")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val canOpen = intent.resolveActivity(context.packageManager) != null
    if (canOpen) {
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            return false
        }
    }
    return canOpen
}