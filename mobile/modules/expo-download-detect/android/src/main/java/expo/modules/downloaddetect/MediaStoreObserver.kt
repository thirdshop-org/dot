package expo.modules.downloaddetect

import android.content.ContentResolver
import android.content.Context
import android.database.ContentObserver
import android.database.Cursor
import android.net.Uri
import android.os.Handler
import android.provider.MediaStore

class MediaStoreObserver(
    handler: Handler,
    private val context: Context,
    private val onNewFiles: (List<DetectedFile>) -> Unit
) : ContentObserver(handler) {

    private var lastScanTimestamp: Long = System.currentTimeMillis() / 1000L

    override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)
        queryNewFiles()
    }

    override fun onChange(selfChange: Boolean, uri: Uri?, flags: Int) {
        super.onChange(selfChange, uri, flags)
        queryNewFiles()
    }

    private fun queryNewFiles() {
        val files = mutableListOf<DetectedFile>()
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_ADDED
        )

        val selection = "${MediaStore.Files.FileColumns.DATE_ADDED} > ? AND ${MediaStore.Files.FileColumns.SIZE} > 0"
        val selectionArgs = arrayOf(lastScanTimestamp.toString())
        val sortOrder = "${MediaStore.Files.FileColumns.DATE_ADDED} DESC"

        val resolver: ContentResolver = context.contentResolver
        var cursor: Cursor? = null

        try {
            // Try MediaStore.Downloads first
            cursor = try {
                resolver.query(
                    MediaStore.Downloads.getContentUri("external"),
                    projection, selection, selectionArgs, sortOrder
                )
            } catch (_: Exception) {
                null
            }

            // Fallback to MediaStore.Files if Downloads didn't work
            if (cursor == null || cursor.count == 0) {
                cursor?.close()
                cursor = resolver.query(
                    MediaStore.Files.getContentUri("external"),
                    projection, selection, selectionArgs, sortOrder
                )
            }

            cursor?.use { c ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
                val nameCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
                val mimeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
                val sizeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
                val dateCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED)

                while (c.moveToNext()) {
                    val id = c.getLong(idCol)
                    val name = c.getString(nameCol) ?: continue
                    val mimeType = c.getString(mimeCol) ?: "application/octet-stream"
                    val size = c.getLong(sizeCol)
                    val dateAdded = c.getLong(dateCol)

                    val fileUri = Uri.withAppendedPath(
                        MediaStore.Files.getContentUri("external"),
                        id.toString()
                    ).toString()

                    files.add(DetectedFile(
                        id = "media_$id",
                        uri = fileUri,
                        name = name,
                        mimeType = mimeType,
                        size = size,
                        createdAt = dateAdded * 1000L
                    ))
                }
            }
        } catch (_: Exception) {
        } finally {
            cursor?.close()
        }

        if (files.isNotEmpty()) {
            lastScanTimestamp = System.currentTimeMillis() / 1000L
            onNewFiles(files)
        }
    }
}
