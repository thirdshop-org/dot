package com.vaultdrop.mobile.data.local

import com.vaultdrop.mobile.data.local.entity.FileEntity

/** Date de référence d'un fichier : modification SAF quand dispo, sinon ajout local. */
val FileEntity.referenceDate: Long
    get() = lastModified ?: addedAt

/** Tri documents : même ordre que la grille d'accueil, du plus récent au plus vieux. */
fun List<FileEntity>.orderedByReferenceDateDesc(): List<FileEntity> =
    sortedByDescending { it.referenceDate }