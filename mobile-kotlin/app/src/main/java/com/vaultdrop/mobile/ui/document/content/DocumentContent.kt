package com.vaultdrop.mobile.ui.document.content

import android.content.ContentResolver
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.InputStream

/**
 * Accès au contenu physique d'un document SAF (`content://`).
 *
 * La permission persistable de lecture est prise à l'import du dossier
 * (`takePersistableUriPermission`), le `ContentResolver` peut donc lire le
 * fichier sans resaisie utilisateur.
 */
object DocumentContent {

    fun openFileDescriptor(
        contentResolver: ContentResolver,
        uri: String,
    ): ParcelFileDescriptor? =
        contentResolver.openFileDescriptor(Uri.parse(uri), "r")

    fun openInputStream(
        contentResolver: ContentResolver,
        uri: String,
    ): InputStream? =
        contentResolver.openInputStream(Uri.parse(uri))
}