package expo.modules.downloaddetect

import android.app.DownloadManager
import android.content.Context
import android.content.IntentFilter
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoDownloadDetectModule : Module() {

    private var broadcastReceiver: DownloadBroadcastReceiver? = null
    private var contentObserver: MediaStoreObserver? = null
    private var isWatching = false

    override fun definition() = ModuleDefinition {
        Name("ExpoDownloadDetect")

        Events("onNewFile")

        Function("startWatching") {
            if (!isWatching) startObserving()
            null
        }

        Function("stopWatching") {
            stopObserving()
        }

        AsyncFunction("getRecentDownloads") {
            queryRecentFiles()
        }
    }

    private val context: Context
        get() = requireNotNull(appContext.reactContext)

    private fun startObserving() {
        val ctx = context

        // Register BroadcastReceiver for DownloadManager
        broadcastReceiver = DownloadBroadcastReceiver { event ->
            sendEvent("onNewFile", bundleOf(
                "id" to event.id,
                "uri" to event.uri,
                "name" to event.name,
                "mimeType" to event.mimeType,
                "size" to event.size,
                "createdAt" to event.createdAt,
                "source" to "download"
            ))
        }

        val intentFilter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        ctx.registerReceiver(broadcastReceiver, intentFilter, Context.RECEIVER_NOT_EXPORTED)

        // Register ContentObserver on MediaStore
        val handler = Handler(Looper.getMainLooper())
        contentObserver = MediaStoreObserver(handler, ctx) { newFiles ->
            for (file in newFiles) {
                sendEvent("onNewFile", bundleOf(
                    "id" to file.id,
                    "uri" to file.uri,
                    "name" to file.name,
                    "mimeType" to file.mimeType,
                    "size" to file.size,
                    "createdAt" to file.createdAt,
                    "source" to "mediastore"
                ))
            }
        }

        val uri = MediaStore.Files.getContentUri("external")
        ctx.contentResolver.registerContentObserver(uri, true, contentObserver!!)

        // Scan existing files on startup
        val existingFiles = queryRecentFiles()
        for (file in existingFiles) {
            sendEvent("onNewFile", bundleOf(
                "id" to file.id,
                "uri" to file.uri,
                "name" to file.name,
                "mimeType" to file.mimeType,
                "size" to file.size,
                "createdAt" to file.createdAt,
                "source" to "startup"
            ))
        }

        isWatching = true
    }

    private fun stopObserving() {
        val ctx = context

        broadcastReceiver?.let {
            try {
                ctx.unregisterReceiver(it)
            } catch (_: Exception) {}
            broadcastReceiver = null
        }

        contentObserver?.let {
            ctx.contentResolver.unregisterContentObserver(it)
            contentObserver = null
        }

        isWatching = false
    }

    private fun queryRecentFiles(): List<DetectedFile> {
        val files = mutableListOf<DetectedFile>()
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_ADDED
        )

        val selection = "${MediaStore.Files.FileColumns.SIZE} > 0"
        val sortOrder = "${MediaStore.Files.FileColumns.DATE_ADDED} DESC"
        val limit = 100

        context.contentResolver.query(
            MediaStore.Files.getContentUri("external"),
            projection,
            selection,
            null,
            sortOrder
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
            val mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
            val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
            val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED)

            var count = 0
            while (cursor.moveToNext() && count < limit) {
                val id = cursor.getLong(idCol)
                val name = cursor.getString(nameCol) ?: continue
                val mimeType = cursor.getString(mimeCol) ?: "application/octet-stream"
                val size = cursor.getLong(sizeCol)
                val dateAdded = cursor.getLong(dateCol)

                val uri = Uri.withAppendedPath(
                    MediaStore.Files.getContentUri("external"),
                    id.toString()
                ).toString()

                files.add(DetectedFile(
                    id = "media_$id",
                    uri = uri,
                    name = name,
                    mimeType = mimeType,
                    size = size,
                    createdAt = dateAdded * 1000L
                ))
                count++
            }
        }

        return files
    }
}
