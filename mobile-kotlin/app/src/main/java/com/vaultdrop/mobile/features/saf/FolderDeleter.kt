package com.vaultdrop.mobile.features.saf

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.room.withTransaction
import com.vaultdrop.mobile.data.local.AppDatabase
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FolderEntity
import com.vaultdrop.mobile.data.repository.FileRepository
import com.vaultdrop.mobile.data.repository.FolderRepository
import com.vaultdrop.mobile.data.repository.OutboxRepository
import com.vaultdrop.mobile.features.thumbnails.ThumbnailStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Suppression de dossiers en mode multi-sélection.
 *
 * Un dossier SAF ne peut être supprimé physiquement que vide : on supprime donc
 * récursivement son contenu (fichiers puis sous-dossiers, du plus profond au
 * plus proche) avant le dossier lui-même. Room sert de source de vérité pour
 * l'énumération du contenu (issue du walk SAF).
 *
 * Trois modes (partagés avec `FileDeleter`) :
 * - **LOCALLY** : suppression physique SAF de l'arbre + marquage `exists = 0`
 *   Room, sans outbox (le serveur n'est pas affecté).
 * - **IN_CLOUD** : enqueue `delete_resource` pour les dossiers uniquement.
 * - **FULL** : les deux — suppression physique + outbox, transaction atomique.
 */
@Singleton
class FolderDeleter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val folderRepository: FolderRepository,
    private val fileRepository: FileRepository,
    private val outboxRepository: OutboxRepository,
    private val appDatabase: AppDatabase,
    private val thumbnailStore: ThumbnailStore,
) {

    private val resolver: ContentResolver get() = context.contentResolver

    /** Descendants collectés d'un dossier — fichiers à tout niveau + sous-dossiers. */
    private data class FolderTree(
        val files: List<FileEntity>,
        val folders: List<FolderEntity>,
    )

    suspend fun deleteFolders(
        folders: List<FolderEntity>,
        mode: FileDeleter.DeleteMode,
    ): FileDeleter.DeleteReport {
        var succeeded = 0
        var failed = 0
        withContext(Dispatchers.IO) {
            for (folder in folders) {
                val ok = when (mode) {
                    FileDeleter.DeleteMode.LOCALLY -> deleteLocally(folder)
                    FileDeleter.DeleteMode.IN_CLOUD -> deleteInCloud(folder)
                    FileDeleter.DeleteMode.FULL -> deleteFull(folder)
                }
                if (ok) succeeded++ else failed++
            }
        }
        return FileDeleter.DeleteReport(succeeded, failed)
    }

    /** Suppression physique locale uniquement (SAF + Room), outbox absente. */
    private suspend fun deleteLocally(folder: FolderEntity): Boolean {
        val uri = folder.uri ?: return false
        val tree = collectDescendants(folder.resourceId)
        if (deleteTreePhysically(folder, tree)) {
            val now = System.currentTimeMillis()
            tree.files.forEach { fileRepository.markMissing(it.resourceId, now) }
            tree.folders.forEach { folderRepository.markMissing(it.resourceId, now) }
            folderRepository.markMissing(folder.resourceId, now)
            tree.files.forEach { thumbnailStore.delete(it.resourceId) }
            Timber.d("deleted folder locally %s", uri)
            return true
        }
        Timber.w("local delete returned false for %s", uri)
        return false
    }

    /** Suppression cloud uniquement (outbox `delete_resource`), physique intact. */
    private suspend fun deleteInCloud(folder: FolderEntity): Boolean {
        var ok = false
        runCatching {
            if (outboxRepository.hasCreateOperationAnyType(folder.resourceId)) {
                outboxRepository.enqueueDeleteResource(folder.resourceId, "folder")
            }
            ok = true
            Timber.d("enqueued cloud delete for folder %s", folder.resourceId)
        }.onFailure { e ->
            Timber.w(e, "enqueueDeleteResource failed for folder %s", folder.resourceId)
        }
        return ok
    }

    /** Suppression complète : physique + cloud. Transaction atomique Room. */
    private suspend fun deleteFull(folder: FolderEntity): Boolean {
        val uri = folder.uri
        if (uri != null) {
            val tree = collectDescendants(folder.resourceId)
            if (deleteTreePhysically(folder, tree)) {
                val now = System.currentTimeMillis()
                appDatabase.withTransaction {
                    treeMarkMissing(folder, tree, now)
                }
                tree.files.forEach { thumbnailStore.delete(it.resourceId) }
                Timber.d("deleted folder full %s", uri)
                return true
            }
            Timber.w("deleteDocument returned false for %s", uri)
            return false
        }
        // Cloud-only : outbox uniquement.
        return deleteInCloud(folder)
    }

    /** Marque missing + outbox `delete_resource` pour toute la descendance, atomique. */
    private suspend fun treeMarkMissing(folder: FolderEntity, tree: FolderTree, now: Long) {
        for (file in tree.files) {
            fileRepository.markMissing(file.resourceId, now)
            if (outboxRepository.hasCreateOperation(file.resourceId)) {
                outboxRepository.enqueueDeleteResource(file.resourceId, "file")
            }
        }
        for (desc in tree.folders) {
            folderRepository.markMissing(desc.resourceId, now)
            if (outboxRepository.hasCreateOperationAnyType(desc.resourceId)) {
                outboxRepository.enqueueDeleteResource(desc.resourceId, "folder")
            }
        }
        folderRepository.markMissing(folder.resourceId, now)
        if (outboxRepository.hasCreateOperationAnyType(folder.resourceId)) {
            outboxRepository.enqueueDeleteResource(folder.resourceId, "folder")
        }
    }

    /** Énumère le contenu d'un dossier (fichiers + sous-dossiers, tout niveau) via Room. */
    private suspend fun collectDescendants(folderResourceId: String): FolderTree {
        val files = fileRepository.getFilesInFolder(folderResourceId).toMutableList()
        val folders = mutableListOf<FolderEntity>()
        val children = folderRepository.getChildren(folderResourceId)
        for (child in children) {
            val sub = collectDescendants(child.resourceId)
            files += sub.files
            folders += child
            folders += sub.folders
        }
        return FolderTree(files = files, folders = folders)
    }

    /**
     * Suppression SAF physique d'un arbre : fichiers d'abord, puis sous-dossiers
     * du plus profond au plus proche, puis le dossier racine (deleteDocument
     * exige un conteneur vide). Retourne `true` si tout l'arbre est supprimé.
     */
    private suspend fun deleteTreePhysically(folder: FolderEntity, tree: FolderTree): Boolean {
        for (file in tree.files) {
            if (!deleteDocument(file.uri)) return false
        }
        val orderedDirs = tree.folders
            .map { it to depthOf(it.resourceId, folder.resourceId) }
            .sortedByDescending { it.second }
            .map { it.first }
        for (dir in orderedDirs) {
            if (!deleteDocument(dir.uri)) return false
        }
        return deleteDocument(folder.uri)
    }

    /** Appelle `deleteDocument` SAF ; sans uri = rien à faire (= succès). */
    private suspend fun deleteDocument(uri: String?): Boolean {
        if (uri == null) return true
        return runCatching {
            DocumentsContract.deleteDocument(resolver, Uri.parse(uri))
        }.onFailure { e ->
            Timber.w(e, "deleteDocument failed for %s", uri)
        }.getOrDefault(false)
    }

    /** Profondeur d'un descendant par rapport à la racine de l'arbre (itère Room). */
    private suspend fun depthOf(resourceId: String, rootResourceId: String): Int {
        var depth = 0
        var current = folderRepository.getFolder(resourceId)
        while (current != null && current.parentResourceId != null && current.parentResourceId != rootResourceId) {
            depth++
            current = folderRepository.getFolder(current.parentResourceId)
        }
        return depth
    }
}