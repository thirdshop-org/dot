package com.vaultdrop.mobile.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * État du mode multi-sélection (long-press pour entrer, tap pour cocher).
 * Volatile : perdu à la rotation, ce qui est acceptable pour une sélection
 * transitoire.
 */
@Stable
class SelectionState {
    var active by mutableStateOf(false)
        private set
    var ids by mutableStateOf<Set<String>>(emptySet())
        private set

    fun start(id: String) {
        active = true
        ids = setOf(id)
    }

    fun toggle(id: String) {
        ids = if (id in ids) ids - id else ids + id
    }

    fun clear() {
        active = false
        ids = emptySet()
    }
}

@Composable
fun rememberSelectionState(): SelectionState = remember { SelectionState() }

/** Pastille de sélection affichée sur une carte en mode multi-sélection. */
@Composable
fun SelectionStatusIcon(selected: Boolean, modifier: Modifier = Modifier) {
    Icon(
        imageVector = if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
        contentDescription = null,
        tint = if (selected) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
        modifier = modifier.size(24.dp),
    )
}