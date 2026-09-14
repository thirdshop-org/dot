package com.vaultdrop.mobile.ui.share

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R

/** Niveau d'accès sélectionnable — miroir de `ShareAccessLevel`. */
private data class AccessOption(
    val labelRes: Int,
    val value: String,
)

private val ACCESS_OPTIONS = listOf(
    AccessOption(R.string.share_access_viewer, ShareAccessLevel.VIEWER),
    AccessOption(R.string.share_access_commenter, ShareAccessLevel.COMMENTER),
    AccessOption(R.string.share_access_editor, ShareAccessLevel.EDITOR),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareBottomSheet(
    resourceName: String,
    onDismiss: () -> Unit,
    onShare: (username: String, access: String) -> Unit,
    sharing: Boolean,
    error: String?,
    enqueued: Boolean,
) {
    var username by remember { mutableStateOf("") }
    var access by remember { mutableStateOf(ShareAccessLevel.VIEWER) }
    val sheetState = rememberModalBottomSheetState()

    LaunchedEffect(enqueued) {
        if (enqueued) onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.share_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = resourceName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )

            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text(stringResource(R.string.share_username_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Text(
                text = stringResource(R.string.share_access_label),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            AccessDropdown(
                selected = access,
                onSelect = { access = it },
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let { code ->
                Text(
                    text = stringResource(shareErrorResFor(code)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Button(
                onClick = { onShare(username.trim(), access) },
                enabled = username.isNotBlank() && !sharing,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (sharing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Filled.Share, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.share_submit))
                }
            }
            OutlinedButton(
                onClick = onDismiss,
                enabled = !sharing,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.share_cancel))
            }
        }
    }
}

@Composable
private fun AccessDropdown(
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = ACCESS_OPTIONS.firstOrNull { it.value == selected }?.labelRes
        ?: ACCESS_OPTIONS.first().labelRes

    Box(modifier = modifier) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = stringResource(selectedLabel),
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Start,
            )
            Icon(
                imageVector = Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            ACCESS_OPTIONS.forEach { option ->
                DropdownMenuItem(
                    text = { Text(stringResource(option.labelRes)) },
                    onClick = {
                        onSelect(option.value)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun shareErrorResFor(code: String): Int = when (code) {
    "USER_NOT_FOUND" -> R.string.share_error_not_found
    else -> R.string.share_error_generic
}