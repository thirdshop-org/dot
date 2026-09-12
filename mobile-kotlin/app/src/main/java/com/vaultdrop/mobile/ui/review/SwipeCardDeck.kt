package com.vaultdrop.mobile.ui.review

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import com.vaultdrop.mobile.ui.document.content.DocumentContentViewer
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Pile de cartes du mode review : la carte du dessus affiche le contenu réel
 * du document ; les cartes du dessous ne sont que des emplacements simplifiés
 * (nom + catégorie), le contenu lourd n'étant chargé que pour la carte
 * visible. Les actions (garder/supprimer) sont pilotées par les boutons de
 * l'écran, pas par le geste.
 */
@Composable
fun SwipeCardDeck(
    cards: List<FileEntity>,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        val visible = cards.take(MAX_STACK)

        visible.asReversed().forEach { file ->
            val depth = visible.indexOf(file)
            key(file.resourceId) {
                if (depth == 0) {
                    TopCard(
                        file = file,
                        onOpenExternalFailed = onOpenExternalFailed,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    StackedCard(
                        file = file,
                        depth = depth,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }
}

/** Carte du dessus : contenu réel du document + barre méta. */
@Composable
private fun TopCard(
    file: FileEntity,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(CardShape)
            .background(MaterialTheme.colorScheme.surface),
    ) {
        DocumentContentViewer(
            file = file,
            onOpenExternalFailed = onOpenExternalFailed,
            modifier = Modifier.fillMaxSize(),
        )

        ReviewCardMetaBar(
            file = file,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
        )
    }
}

/** Emplacement de la prochaine carte : icône + nom, sans contenu lourd. */
@Composable
private fun StackedCard(
    file: FileEntity,
    depth: Int,
    modifier: Modifier = Modifier,
) {
    val scale = 1f - depth * STACK_SHRINK

    Box(
        modifier = modifier
            .offset(y = (depth * STACK_OFFSET_DP).dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(CardShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            FileCategoryIcon(file = file, size = 44.dp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = file.name,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 24.dp),
            )
        }
    }
}

/** Barre méta du document (nom, poids, date) en bas de la carte. */
@Composable
private fun ReviewCardMetaBar(file: FileEntity, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FileCategoryIcon(file = file, size = 20.dp)
            Text(
                text = file.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${formatSize(file.size)}  •  ${formatDate(file)}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun formatSize(bytes: Long): String {
    val kb = 1024.0
    val mb = kb * 1024
    return when {
        bytes >= mb -> String.format(Locale.getDefault(), "%.1f Mo", bytes / mb)
        bytes >= kb -> String.format(Locale.getDefault(), "%.1f ko", bytes / kb)
        else -> "$bytes o"
    }
}

private fun formatDate(file: FileEntity): String {
    val millis = file.lastModified ?: file.addedAt
    return DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
        .withLocale(Locale.getDefault())
        .format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate())
}

private val CardShape = RoundedCornerShape(20.dp)
private const val MAX_STACK = 3
private const val STACK_SHRINK = 0.045f
private const val STACK_OFFSET_DP = 18f