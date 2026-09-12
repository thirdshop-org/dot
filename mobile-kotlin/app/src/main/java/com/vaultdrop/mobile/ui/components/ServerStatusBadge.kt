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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.features.connection.ServerConnectionStatus
import com.vaultdrop.mobile.ui.theme.InactiveGray

private val OnlineGreen = Color(0xFF2E7D32)
private val CheckingAmber = Color(0xFFF9A825)

/**
 * Pilule de statut serveur affichée dans le header : cercle coloré + libellé.
 * Un appui relance une vérification immédiate du serveur.
 */
@Composable
fun ServerStatusBadge(
    status: ServerConnectionStatus,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (dotColor, labelRes) = when (status) {
        ServerConnectionStatus.Checking -> CheckingAmber to R.string.status_checking
        ServerConnectionStatus.Online -> OnlineGreen to R.string.status_online
        ServerConnectionStatus.Offline -> MaterialTheme.colorScheme.error to R.string.status_offline
        ServerConnectionStatus.Local -> InactiveGray to R.string.status_local
    }
    val label = stringResource(labelRes)
    val tapLabel = stringResource(R.string.status_tap_to_recheck)
    val shape = RoundedCornerShape(percent = 50)

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
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(dotColor, CircleShape),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}