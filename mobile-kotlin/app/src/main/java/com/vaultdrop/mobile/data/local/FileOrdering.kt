package com.vaultdrop.mobile.data.local

import com.vaultdrop.mobile.data.local.entity.FileEntity

/** Fil documents : même ordre que la grille d'accueil, du plus récent au plus vieux. */
fun List<FileEntity>.orderedByAddedAtDesc(): List<FileEntity> = sortedByDescending { it.addedAt }