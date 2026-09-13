package com.vaultdrop.mobile.ui.pdfbuilder

import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.domain.FileCategory
import com.vaultdrop.mobile.ui.components.categoryValue
import java.io.File

/**
 * Item de l'assemblage PDF : un fichier lisible localement (PDF / image / texte),
 * une note de texte libre, ou une image brute sur disque (pages scannées).
 * L'ordre de la liste est l'ordre du PDF final.
 */
sealed interface PdfBuilderItem {
    val id: String

    data class FileItem(
        val file: FileEntity,
        val failed: Boolean = false,
    ) : PdfBuilderItem {
        override val id: String get() = file.resourceId
    }

    data class NoteItem(
        override val id: String,
        val body: String,
    ) : PdfBuilderItem

    /** Image JPEG sur disque (ex. une page du scanner) déjà mise à l'endroit. */
    data class FilePathItem(
        val file: File,
        override val id: String,
    ) : PdfBuilderItem
}

/** Fichier pouvant entrer dans un assemblage : copie locale + catégorie lisible. */
fun FileEntity.isPdfBuilderSource(): Boolean =
    uri != null && categoryValue() in PDF_BUILDER_CATEGORIES

private val PDF_BUILDER_CATEGORIES =
    setOf(FileCategory.PDF, FileCategory.IMAGE, FileCategory.TEXT)