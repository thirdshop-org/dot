package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.features.sync.SyncViewModel

private val SyncingAccent = Color(0xFF1E88E5)
private val PendingAmber = Color(0xFFF9A825)

/**
 * Pilule de statut de synchro affichée dans le header : spinner quand une marche
 * SAF ou un drain outbox est en cours, compteur d'ops en attente sinon, coche
 * quand tout est poussé. Un appui ouvre la « liste des sync » (dernières ops).
 */
@Composable
fun SyncStatusBadge(
    status: SyncViewModel.SyncStatus,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (accent, label, showSpinner) = when {
        status.syncing -> {
            Triple(SyncingAccent, stringResource(R.string.sync_syncing), true)
        }
        status.pending > 0 -> {
            val label = if (status.pending == 1) {
                stringResource(R.string.sync_pending_count_one)
            } else {
                stringResource(R.string.sync_pending_count, status.pending)
            }
            Triple(PendingAmber, label, false)
        }
        else -> Triple(
            MaterialTheme.colorScheme.primary,
            stringResource(R.string.sync_idle),
            false,
        )
    }
    val shape = RoundedCornerShape(percent = 50)
    val tapLabel = stringResource(R.string.sync_tap_to_view)

    Row(
        modifier = modifier
            .clip(shape)
            .clickable(
                role = Role.Button,
                onClickLabel = tapLabel,
                onClick = onClick,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (showSpinner) {
            CircularProgressIndicator(
                modifier = Modifier.size(12.dp),
                strokeWidth = 2.dp,
                color = accent,
            )
        } else if (status.pending > 0) {
            Box(
                modifier = Modifier
                    .size(14.dp)
                    .background(accent, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = status.pending.coerceAtMost(99).toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
        } else {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = accent,
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * Composable prêt-à-poser dans un header : badge + dialogue « liste des sync ».
 * Le dialogue est géré localement (état `showList`), aucun wiring externe.
 */
@Composable
fun SyncStatusAction(
    syncViewModel: SyncViewModel,
    modifier: Modifier = Modifier,
) {
    val status by syncViewModel.syncStatus.collectAsStateWithLifecycle()
    var showList by remember { mutableStateOf(false) }

    SyncStatusBadge(
        status = status,
        onClick = { showList = true },
        modifier = modifier,
    )

    if (showList) {
        SyncOperationsDialog(
            status = status,
            onDismiss = { showList = false },
        )
    }
}