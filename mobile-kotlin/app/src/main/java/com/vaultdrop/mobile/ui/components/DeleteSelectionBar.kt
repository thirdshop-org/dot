package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus
import com.vaultdrop.mobile.features.saf.FileDeleter

/** Résultat de l\'analyse de compatibilité entre les fichiers et le mode choisi. */
data class DeleteReview(
    val mode: FileDeleter.DeleteMode,
    val total: Int,
    val incompatibleCount: Int,
) {
    val hasWarning: Boolean get() = incompatibleCount > 0
}

/** Analyse les fichiers sélectionnés par rapport au mode de suppression choisi. */
fun reviewDelete(files: List<FileEntity>, mode: FileDeleter.DeleteMode): DeleteReview {
    val incompatible = when (mode) {
        FileDeleter.DeleteMode.IN_CLOUD ->
            files.count { it.syncStatus == FileStatus.LOCAL }
        FileDeleter.DeleteMode.LOCALLY ->
            files.count { it.syncStatus == FileStatus.CLOUD }
        FileDeleter.DeleteMode.FULL ->
            files.count {
                it.syncStatus == FileStatus.LOCAL || it.syncStatus == FileStatus.CLOUD
            }
    }
    return DeleteReview(mode = mode, total = files.size, incompatibleCount = incompatible)
}

/** Bouton dropdown « Supprimer ▼ » stylisé comme un `SelectionAction`. */
@Composable
fun DeleteDropdownButton(
    enabled: Boolean,
    onModeSelected: (FileDeleter.DeleteMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val tint = if (enabled) MaterialTheme.colorScheme.error
    else MaterialTheme.colorScheme.onSurfaceVariant

    Box(modifier = modifier) {
        Surface(
            onClick = { if (enabled) expanded = true },
            enabled = enabled,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
            color = if (enabled) MaterialTheme.colorScheme.errorContainer
            else MaterialTheme.colorScheme.surfaceVariant,
            modifier = modifier,
        ) {
            Box(
                modifier = Modifier
                    .size(width = 88.dp, height = 48.dp),
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.foundation.layout.Row(
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = null,
                        tint = tint,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = stringResource(R.string.delete),
                        color = tint,
                        fontSize = 11.sp,
                        maxLines = 1,
                        fontWeight = FontWeight.Bold,
                    )
                    Icon(
                        imageVector = Icons.Filled.ArrowDropDown,
                        contentDescription = null,
                        tint = tint,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.delete_locally)) },
                onClick = {
                    expanded = false
                    onModeSelected(FileDeleter.DeleteMode.LOCALLY)
                },
                leadingIcon = {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.delete_in_cloud)) },
                onClick = {
                    expanded = false
                    onModeSelected(FileDeleter.DeleteMode.IN_CLOUD)
                },
                leadingIcon = {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.delete_full)) },
                onClick = {
                    expanded = false
                    onModeSelected(FileDeleter.DeleteMode.FULL)
                },
                leadingIcon = {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                },
            )
        }
    }
}

/** Modale de confirmation avant suppression. */
@Composable
fun DeleteConfirmDialog(
    count: Int,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Filled.Delete,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
            )
        },
        title = {
            Text(
                text = stringResource(R.string.delete_confirm_title, count),
                style = MaterialTheme.typography.headlineSmall,
            )
        },
        text = {
            Text(
                text = stringResource(R.string.delete_confirm_message),
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    text = stringResource(R.string.delete_confirm_button),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = stringResource(R.string.delete_cancel))
            }
        },
    )
}

/** Modale d\'avertissement quand certains fichiers ne sont pas synchronisés. */
@Composable
fun DeleteWarningDialog(
    review: DeleteReview,
    onContinue: () -> Unit,
    onDismiss: () -> Unit,
) {
    val message = when (review.mode) {
        FileDeleter.DeleteMode.IN_CLOUD -> stringResource(
            R.string.delete_warning_local_only_msg,
            review.incompatibleCount,
            review.total,
        )
        FileDeleter.DeleteMode.LOCALLY -> stringResource(
            R.string.delete_warning_cloud_only_msg,
            review.incompatibleCount,
            review.total,
        )
        FileDeleter.DeleteMode.FULL -> {
            val localOnly = review.incompatibleCount
            stringResource(
                R.string.delete_warning_local_only_msg,
                localOnly,
                review.total,
            )
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Filled.Warning,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
            )
        },
        title = {
            Text(
                text = stringResource(R.string.delete_warning_title),
                style = MaterialTheme.typography.headlineSmall,
            )
        },
        text = {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        confirmButton = {
            TextButton(onClick = onContinue) {
                Text(
                    text = stringResource(R.string.delete_confirm_button),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = stringResource(R.string.delete_cancel))
            }
        },
    )
}
