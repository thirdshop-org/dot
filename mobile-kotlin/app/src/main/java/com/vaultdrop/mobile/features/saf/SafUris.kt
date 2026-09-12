package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract

/**
 * Conversions d'URI SAF partagées par SafFolderCreator et FileMover.
 * `DocumentsContract` attend des URI *document* ; les racines importées sont
 * stockées en URI *tree* et doivent être converties avant createDocument/
 * moveDocument.
 */
object SafUris {

    /**
     * Convertit une uri SAF en uri *document* utilisable par createDocument /
     * moveDocument.
     *
     * Attention : `DocumentsContract.isTreeUri()` renvoie `true` pour toute uri
     * commençant par `tree/`, y compris les uri *document* sous un tree
     * (`tree/<treeId>/document/<docId>`). On doit donc les renvoyer telles
     * quelles — sinon le `documentId` (ie. le sous-dossier) est remplacé par la
     * racine de l'arbre, et un dossier/fichier ciblé sous un dossier imbriqué
     * est créé/déplacé à la racine.
     */
    fun toDocumentUri(uri: String?): Uri? {
        val raw = uri?.let(Uri::parse) ?: return null
        val segments = raw.pathSegments
        val isDocumentUnderTree = raw.scheme == ContentResolver.SCHEME_CONTENT &&
            segments.size >= 3 && segments[0] == "tree" && segments[2] == "document"
        if (isDocumentUnderTree) return raw
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