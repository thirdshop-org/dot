package com.vaultdrop.mobile.ui.review

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.ui.components.FileCategoryIcon
import com.vaultdrop.mobile.ui.document.content.DocumentContentViewer
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Pile de cartes « tinder » pour traiter les nouveaux documents.
 *
 * La carte du dessus affiche le contenu réel du document et glisse à
 * gauche (supprimer) ou à droite (garder) dès qu'elle dépasse le seuil ;
 * les cartes du dessous ne sont que des emplacements simplifiés (nom +
 * catégorie), le contenu lourd n'étant chargé que pour la carte visible.
 */
@Composable
fun SwipeCardDeck(
    cards: List<FileEntity>,
    onKeep: (FileEntity) -> Unit,
    onDelete: (FileEntity) -> Unit,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier) {
        val widthPx = with(LocalDensity.current) { maxWidth.toPx() }
        val visible = cards.take(MAX_STACK)

        visible.asReversed().forEach { file ->
            val depth = visible.indexOf(file)
            key(file.resourceId) {
                if (depth == 0) {
                    SwipeableTopCard(
                        file = file,
                        widthPx = widthPx,
                        onKeep = { onKeep(file) },
                        onDelete = { onDelete(file) },
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

@Composable
private fun SwipeableTopCard(
    file: FileEntity,
    widthPx: Float,
    onKeep: () -> Unit,
    onDelete: () -> Unit,
    onOpenExternalFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val offsetX = remember(file.resourceId) { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val threshold = widthPx * SWIPE_THRESHOLD

    Box(
        modifier = modifier
            .graphicsLayer {
                translationX = offsetX.value
                rotationZ = (offsetX.value / widthPx) * MAX_ROTATION_DEG
            }
            .clip(CardShape)
            .background(MaterialTheme.colorScheme.surface)
            .pointerInput(file.resourceId) {
                detectHorizontalDragGestures(
                    onHorizontalDrag = { change, dragAmount ->
                        change.consume()
                        scope.launch {
                            offsetX.snapTo((offsetX.value + dragAmount).coerceIn(-widthPx, widthPx))
                        }
                    },
                    onDragEnd = {
                        scope.launch {
                            when {
                                offsetX.value >= threshold -> {
                                    offsetX.animateTo(widthPx * 1.7f, tween(DRAG_OUT_MS))
                                    onKeep()
                                }

                                offsetX.value <= -threshold -> {
                                    offsetX.animateTo(-widthPx * 1.7f, tween(DRAG_OUT_MS))
                                    onDelete()
                                }

                                else -> offsetX.animateTo(0f, spring(stiffness = Spring.StiffnessMediumLow))
                            }
                        }
                    },
                    onDragCancel = {
                        scope.launch { offsetX.animateTo(0f, spring(stiffness = Spring.StiffnessMediumLow)) }
                    },
                )
            },
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

        val progress = (offsetX.value / threshold).coerceIn(-1f, 1f)
        ReviewSwipeLabel(
            text = stringResource(R.string.review_keep),
            color = KeepColor,
            visible = progress > 0f,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 16.dp, top = 72.dp)
                .alpha(progress),
        )
        ReviewSwipeLabel(
            text = stringResource(R.string.review_delete),
            color = DeleteColor,
            visible = progress < 0f,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 16.dp, top = 72.dp)
                .alpha(-progress),
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

/** Badge « GARDER » / « SUPPRIMER » affiché pendant le drag. */
@Composable
private fun ReviewSwipeLabel(
    text: String,
    color: Color,
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    Surface(
        modifier = modifier,
        color = color,
        shape = RoundedCornerShape(8.dp),
    ) {
        Text(
            text = text,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
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
private val KeepColor = Color(0xFF2E7D32)
private val DeleteColor = Color(0xFFC62828)
private const val MAX_STACK = 3
private const val SWIPE_THRESHOLD = 0.3f
private const val MAX_ROTATION_DEG = 12f
private const val DRAG_OUT_MS = 220
private const val STACK_SHRINK = 0.045f
private const val STACK_OFFSET_DP = 18f