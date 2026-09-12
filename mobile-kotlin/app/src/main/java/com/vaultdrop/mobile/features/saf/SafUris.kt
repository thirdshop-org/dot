package com.vaultdrop.mobile.features.saf

import android.net.Uri
import android.provider.DocumentsContract

/**
 * Conversions d'URI SAF partagées par SafFolderCreator et FileMover.
 * `DocumentsContract` attend des URI *document* ; les racines importées sont
 * stockées en URI *tree* et doivent être converties avant createDocument/
 * moveDocument.
 */
object SafUris {

    fun toDocumentUri(uri: String?): Uri? {
        val raw = uri?.let(Uri::parse) ?: return null
        return if (DocumentsContract.isTreeUri(raw)) {
            DocumentsContract.buildDocumentUriUsingTree(
                raw,
                DocumentsContract.getTreeDocumentId(raw),
            )
        } else {
            raw
        }
    }
}