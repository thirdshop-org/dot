package com.vaultdrop.mobile.features.saf

import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.SaveFolderInput
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fusion de dossiers en mode multi-sélection.
 *
 * 1. Crée un nouveau dossier nommé `newName` au même niveau que les dossiers
 *    sélectionnés (même parent).
 * 2. Déplace tout le contenu de chaque dossier source (fichiers + sous-dossiers)
 *    vers le dossier fusionné — relocation SAF quand les deux côtés sont
 *    physiques, repli métadonnée seule sinon (`move_resource` outbox quand même).
 * 3. Supprime les dossiers sources désormais vides (physique + outbox).
 *
 * L'ordre outbox est garanti par l'insertion séquentielle : `create_resource`
 * du dossier fusionné avant les `move_resource`, avant les `delete_resource`.
 */
@Singleton
class FolderMerger @Inject constructor(
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val fileMover: FileMover,
    private val folderDeleter: FolderDeleter,
    private val safFolderCreator: SafFolderCreator,
) {

    data class MergeReport(
        val movedFiles: Int,
        val deletedFolders: Int,
        val failed: Int,
    )

    /**
     * Fusionne `folders` (frères, même parcours d'explorateur) sous un nouveau
     * dossier `newName`. Retourne un rapport d'exécution.
     */
    suspend fun mergeSelectedFolders(folders: List<FolderEntity>, newName: String): MergeReport {
        require(folders.size >= 2) { "merge requires at least 2 folders" }

        // 1. Dossier fusionné au même niveau que les sources.
        val parentId = folders.first().parentResourceId
        val merged = createMergedFolder(parentId, newName)

        // 2. Déplacement du contenu de chaque dossier source.
        var movedFiles = 0
        var stepFailures = 0
        withContext(Dispatchers.IO) {
            for (src in folders) {
                val ok = runCatching {
                    val files = fileRepository.getFilesInFolder(src.resourceId)
                    if (files.isNotEmpty()) {
                        fileMover.moveFiles(files.map { it.resourceId }, merged.resourceId)
                        movedFiles += files.size
                    }
                    val subFolders = folderRepository.getChildren(src.resourceId)
                    if (subFolders.isNotEmpty()) {
                        folderRepository.reparentSubFolders(subFolders.map { it.resourceId }, merged.resourceId)
                    }
                }.isSuccess
                if (!ok) stepFailures++
            }
        }

        // 3. Suppression des dossiers sources (désormais sans contenu).
        var deletedFolders = 0
        var failed = 0
        withContext(Dispatchers.IO) {
            for (src in folders) {
                val report = folderDeleter.deleteFolders(listOf(src), FileDeleter.DeleteMode.FULL)
                if (report.failed == 0) deletedFolders++ else failed++
            }
        }
        failed += stepFailures
        Timber.d("merge '%s': %d fichiers déplacés, %d dossiers supprimés, %d échecs",
            newName, movedFiles, deletedFolders, failed)
        return MergeReport(movedFiles = movedFiles, deletedFolders = deletedFolders, failed = failed)
    }

    /**
     * Crée (physique si le parent l'est, cloud-only sinon) et enregistre en Room
     * le dossier fusionné. Retourne l'entité Room. La sauvegarde enqueue le
     * `create_resource` dans la même transaction.
     */
    private suspend fun createMergedFolder(parentId: String?, newName: String): FolderEntity {
        val parent = parentId?.let { folderRepository.getFolder(it) }
        val createdUri = parent?.uri?.let { safFolderCreator.createFolder(it, newName) }?.toString()
        return folderRepository.saveFolder(
            input = SaveFolderInput(
                uri = createdUri,
                name = newName,
                exists = true,
                createdInApp = true,
            ),
            parentResourceId = parentId,
        )
    }
}