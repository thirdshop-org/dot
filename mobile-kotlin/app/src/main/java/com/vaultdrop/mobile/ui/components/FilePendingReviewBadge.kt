package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity

/**
 * Un fichier est « à traiter » s'il est présent physiquement et jamais encore
 * gardé dans le mode review (`processed = 0`) — prédicat identique à la file
 * de review (`FileDao.getUnprocessed`). Un fichier cloud-only n'est jamais
 * concerné.
 */
internal fun FileEntity.isPendingReview(): Boolean =
    exists == 1 && uri != null && !processed

/**
 * Badge « À traiter » posé sur une ligne fichier : signale visuellement que le
 * document n'a pas encore été gardé et n'est donc pas synchronisé (gate
 * `processed`). Rendu vide pour les fichiers déjà traités / cloud-only.
 */
@Composable
fun FilePendingReviewBadge(
    file: FileEntity,
    modifier: Modifier = Modifier,
) {
    if (!file.isPendingReview()) return
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.tertiaryContainer,
        modifier = modifier,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
        ) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onTertiaryContainer),
            )
            Text(
                text = stringResource(R.string.file_pending_review),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onTertiaryContainer,
            )
        }
    }
}