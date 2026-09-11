package com.vaultdrop.mobile.ui.document.content

import android.content.ContentResolver
import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage

/** Affichage d'une image via Coil (gère nativement les URIs `content://`). */
@Composable
fun ImageViewer(
    contentResolver: ContentResolver,
    uri: String,
    contentDescription: String,
    modifier: Modifier = Modifier,
) {
    AsyncImage(
        model = Uri.parse(uri),
        contentDescription = contentDescription,
        modifier = modifier.fillMaxSize(),
        contentScale = ContentScale.Fit,
        alignment = Alignment.Center,
    )
}