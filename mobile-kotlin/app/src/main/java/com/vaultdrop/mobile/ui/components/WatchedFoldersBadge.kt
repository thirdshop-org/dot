package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.ui.watchedfolders.WatchedFoldersViewModel

/** Seuil au-delà duquel le badge affiche « 99+ » au lieu du compte exact. */
private const val COUNT_CAP = 99

/**
 * Pilule du header affichant le nombre de dossiers SAF surveillés. Un appui
 * ouvre l'écran listant ces dossiers.
 */
@Composable
fun WatchedFoldersBadge(
    onClick: () -> Unit,
    viewModel: WatchedFoldersViewModel = hiltViewModel(),
) {
    val count by viewModel.count.collectAsStateWithLifecycle(initialValue = 0)
    val label = if (count > COUNT_CAP) {
        stringResource(R.string.watched_count_many)
    } else {
        count.toString()
    }
    val contentDescription = stringResource(R.string.settings_saf_folders)

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(percent = 50))
            .clickable(
                role = Role.Button,
                onClickLabel = contentDescription,
                onClick = onClick,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Visibility,
            contentDescription = contentDescription,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}