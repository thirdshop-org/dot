package com.vaultdrop.mobile.ui.components

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.PendingOpStatus
import com.vaultdrop.mobile.data.local.entity.PendingOperationEntity
import com.vaultdrop.mobile.features.sync.SyncViewModel

private val StatusPending = Color(0xFF1E88E5)
private val StatusSynced = Color(0xFF2E7D32)
private val StatusFailed = Color(0xFFC62828)

/**
 * Dialogue « liste des sync » : dernières opérations de l'outbox (tous statuts),
 * avec un résumé (en attente / échouées) en tête de liste.
 */
@Composable
internal fun SyncOperationsDialog(
    status: SyncViewModel.SyncStatus,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.sync_list_title)) },
        text = {
            Column {
                SyncListSummary(status)
                if (status.operations.isEmpty()) {
                    Text(
                        text = stringResource(R.string.sync_list_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 360.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        items(status.operations, key = { it.id }) { op ->
                            SyncOperationRow(op)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.sync_list_close))
            }
        },
    )
}

@Composable
private fun SyncListSummary(status: SyncViewModel.SyncStatus) {
    val summary = buildString {
        append(stringResource(R.string.sync_summary_total, status.operations.size))
        if (status.pending > 0) {
            append(" · ")
            append(stringResource(R.string.sync_summary_pending, status.pending))
        }
        if (status.failed > 0) {
            append(" · ")
            append(stringResource(R.string.sync_summary_failed, status.failed))
        }
    }
    Text(
        text = summary,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun SyncOperationRow(op: PendingOperationEntity) {
    val (dotColor, statusLabel) = when (op.status) {
        PendingOpStatus.PENDING -> StatusPending to stringResource(R.string.sync_status_pending)
        PendingOpStatus.SYNCED -> StatusSynced to stringResource(R.string.sync_status_synced)
        else -> StatusFailed to stringResource(R.string.sync_status_failed)
    }
    val opLabel = operationLabel(op.operation)
    val time = DateUtils.getRelativeTimeSpanString(op.createdAt).toString()
    val shortId = op.resourceId?.take(8).orEmpty()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(modifier = Modifier.size(8.dp).background(dotColor, CircleShape))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = opLabel,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = listOfNotNull(
                    op.resourceType?.takeIf { it.isNotBlank() },
                    shortId.ifBlank { null },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = statusLabel,
                style = MaterialTheme.typography.labelSmall,
                color = dotColor,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = time,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun operationLabel(operation: String): String = when (operation) {
    "create_resource" -> stringResource(R.string.sync_op_create)
    "move_resource" -> stringResource(R.string.sync_op_move)
    "delete_resource" -> stringResource(R.string.sync_op_delete)
    "update_metadata" -> stringResource(R.string.sync_op_update)
    else -> operation
}