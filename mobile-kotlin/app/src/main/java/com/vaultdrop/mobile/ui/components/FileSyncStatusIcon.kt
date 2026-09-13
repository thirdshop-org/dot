package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import com.vaultdrop.mobile.data.local.entity.FileEntity
import com.vaultdrop.mobile.data.local.entity.FileStatus

/** Placement d'un fichier entre le device et le serveur distant. */
private enum class FileSyncPlacement {
    LOCAL,
    CLOUD,
    LOCAL_CLOUD,
}

private fun FileEntity.syncPlacement(): FileSyncPlacement = when (syncStatus) {
    FileStatus.CLOUD -> FileSyncPlacement.CLOUD
    FileStatus.LOCAL_CLOUD -> FileSyncPlacement.LOCAL_CLOUD
    else -> FileSyncPlacement.LOCAL
}

/** Icône dédiée à chaque placement. */
private val FileSyncPlacement.icon: ImageVector
    get() = when (this) {
        FileSyncPlacement.LOCAL -> Icons.Filled.CloudOff
        FileSyncPlacement.CLOUD -> Icons.Filled.Cloud
        FileSyncPlacement.LOCAL_CLOUD -> Icons.Filled.CloudDone
    }

/** Teinte dédiée à chaque placement. */
private val FileSyncPlacement.color: Color
    get() = when (this) {
        FileSyncPlacement.LOCAL -> Color(0xFFF57F17)
        FileSyncPlacement.CLOUD -> Color(0xFF1565C0)
        FileSyncPlacement.LOCAL_CLOUD -> Color(0xFF2E7D32)
    }

/** Statut de sync d'un fichier — présence device / serveur distant. */
@Composable
fun FileSyncStatusIcon(
    file: FileEntity,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val placement = file.syncPlacement()
    Icon(
        imageVector = placement.icon,
        contentDescription = null,
        tint = placement.color,
        modifier = modifier.size(size),
    )
}