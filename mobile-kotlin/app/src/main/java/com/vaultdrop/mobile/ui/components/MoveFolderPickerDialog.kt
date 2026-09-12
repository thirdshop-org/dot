package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FolderEntity

/**
 * Picker de destination pour déplacer N fichiers : liste arborescente (indent
 * selon la profondeur réelle calculée depuis `parentResourceId`), tap = choix.
 */
@Composable
fun MoveFolderPickerDialog(
    folders: List<FolderEntity>,
    fileCount: Int,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val entries = remember(folders) { buildFolderEntries(folders) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.move_files_count, fileCount)) },
        text = {
            if (entries.isEmpty()) {
                Text(
                    text = stringResource(R.string.move_files_empty),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(modifier = Modifier.height(360.dp)) {
                    items(entries, key = { it.folder.resourceId }) { entry ->
                        FolderPickerRow(
                            folder = entry.folder,
                            depth = entry.depth,
                            onClick = { onConfirm(entry.folder.resourceId) },
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.pdf_builder_cancel))
            }
        },
    )
}

private data class FolderEntry(val folder: FolderEntity, val depth: Int)

/** Profondeur réelle d'un dossier (racines = 0), calculée par chaînage parent. */
private fun buildFolderEntries(folders: List<FolderEntity>): List<FolderEntry> {
    if (folders.isEmpty()) return emptyList()
    val byId = folders.associateBy { it.resourceId }

    fun depth(folder: FolderEntity): Int {
        var current = folder
        var d = 0
        val visited = HashSet<String>()
        while (current.parentResourceId != null && d < MAX_DEPTH) {
            if (!visited.add(current.parentResourceId)) break
            current = byId[current.parentResourceId] ?: break
            d++
        }
        return d
    }

    return folders
        .sortedWith(compareBy({ depth(it) }, { it.name.lowercase() }))
        .map { FolderEntry(it, depth(it)) }
}

@Composable
private fun FolderPickerRow(
    folder: FolderEntity,
    depth: Int,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 8.dp * depth + 8.dp, top = 10.dp, bottom = 10.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Folder,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = folder.name,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = stringResource(R.string.folder),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private const val MAX_DEPTH = 16