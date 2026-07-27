package expo.modules.downloaddetect

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

data class DetectedFile(
    val id: String,
    val uri: String,
    val name: String,
    val mimeType: String,
    val size: Long,
    val createdAt: Long
)

class DownloadBroadcastReceiver(
    private val onFileDetected: (DetectedFile) -> Unit
) : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return

        val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
        if (downloadId == -1L) return

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(downloadId)

        dm.query(query)?.use { cursor ->
            if (!cursor.moveToFirst()) return

            val uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
            val titleIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE)
            val mimeTypeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE)
            val sizeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
            val dateIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP)

            val uri = if (uriIndex >= 0) cursor.getString(uriIndex) ?: "" else ""
            val title = if (titleIndex >= 0) cursor.getString(titleIndex) ?: "unknown" else "unknown"
            val mimeType = if (mimeTypeIndex >= 0) cursor.getString(mimeTypeIndex) ?: "application/octet-stream" else "application/octet-stream"
            val size = if (sizeIndex >= 0) cursor.getLong(sizeIndex) else 0L
            val date = if (dateIndex >= 0) cursor.getLong(dateIndex) else System.currentTimeMillis()

            // Extract filename from URI
            val name = extractFileName(uri, title)

            onFileDetected(DetectedFile(
                id = "download_$downloadId",
                uri = uri,
                name = name,
                mimeType = mimeType,
                size = size,
                createdAt = date
            ))
        }
    }

    private fun extractFileName(uri: String, fallback: String): String {
        if (uri.isNotEmpty()) {
            // content://media/external/downloads/123 or file:///storage/...
            val path = uri.substringAfterLast("/")
            if (path.isNotEmpty() && path.all { it.isDigit() }.not()) {
                return decodeFileName(path)
            }
        }
        return fallback
    }

    private fun decodeFileName(encoded: String): String {
        return try {
            java.net.URLDecoder.decode(encoded, "UTF-8")
        } catch (_: Exception) {
            encoded
        }
    }
}
