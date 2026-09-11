package com.vaultdrop.mobile.ui.document.content

import android.content.ContentResolver
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.vaultdrop.mobile.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Lecture de documents texte bruts (txt, md, log, json…).
 *
 * Le flux est borné (MAX_BYTES) pour ne jamais charger un dump de plusieurs
 * dizaines de Mo en mémoire : au-delà, un bandeau précise que l'aperçu est
 * tronqué.
 */
@Composable
fun TextDocumentViewer(
    contentResolver: ContentResolver,
    uri: String,
    modifier: Modifier = Modifier,
) {
    var text by remember(uri) { mutableStateOf<String?>(null) }
    var truncated by remember(uri) { mutableStateOf(false) }
    var failed by remember(uri) { mutableStateOf(false) }

    LaunchedEffect(uri) {
        text = null
        truncated = false
        failed = false
        val result = withContext(Dispatchers.IO) { readCapped(contentResolver, uri) }
        result?.let {
            text = it.first
            truncated = it.second
        } ?: run { failed = true }
    }

    Box(modifier.fillMaxSize()) {
        when {
            failed -> Text(
                text = stringResource(R.string.document_cannot_read),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.align(Alignment.Center),
            )
            text == null -> Text(
                text = stringResource(R.string.document_loading),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.align(Alignment.Center),
            )
            else -> Column(Modifier.fillMaxSize()) {
                if (truncated) {
                    Text(
                        text = stringResource(R.string.document_truncated_notice),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
                SelectionContainer(Modifier.weight(1f)) {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    ) {
                        item {
                            Text(
                                text = text.orEmpty(),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Lit le flux UTF-8 borné à MAX_BYTES (+1 pour détecter la troncature). */
private fun readCapped(contentResolver: ContentResolver, uri: String): Pair<String, Boolean>? {
    val stream = DocumentContent.openInputStream(contentResolver, uri) ?: return null
    stream.use { input ->
        val buf = ByteArray(MAX_BYTES + 1)
        var offset = 0
        while (offset < buf.size) {
            val read = input.read(buf, offset, buf.size - offset)
            if (read < 0) break
            offset += read
        }
        val truncated = offset > MAX_BYTES
        val length = minOf(offset, MAX_BYTES)
        val decoded = String(buf, 0, length, Charsets.UTF_8)
            .removePrefix("\uFEFF")
        return decoded to truncated
    }
}

private const val MAX_BYTES = 512 * 1024