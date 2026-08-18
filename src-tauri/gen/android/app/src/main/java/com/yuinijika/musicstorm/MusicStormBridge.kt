package com.yuinijika.musicstorm

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.WebView
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Android 专属原生桥：SAF 选目录/选文件 + 系统下载。
 *
 * SAF 复制进应用私有目录而非引用——Rust 扫描管道（std::fs）只认普通路径，
 * 复制后即可复用桌面端同一套入库链路。
 *
 * launcher 在 Activity 属性初始化时注册（早于 STARTED），webView 经 attach
 * 延迟绑定：registerForActivityResult 迟于 STARTED 注册会直接崩溃。
 *
 * 前端以 window.musicStormNative 调用，结果/进度经 CustomEvent 回传：
 * - musicstorm:saf-picked     {ok, cancelled, kind, path, paths}
 * - musicstorm:saf-progress   {done, total}
 * - musicstorm:download-started {name}
 */
class MusicStormBridge(private val activity: MainActivity) {
    private var webView: WebView? = null

    private val folderPicker: ActivityResultLauncher<Uri?> =
        activity.registerForActivityResult(
            ActivityResultContracts.OpenDocumentTree(),
        ) { uri ->
            if (uri != null) {
                onFolderPicked(uri)
            } else {
                replyPick(false, cancelled = true)
            }
        }

    private val filesPicker: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(
            ActivityResultContracts.OpenMultipleDocuments(),
        ) { uris ->
            if (uris.isEmpty()) {
                replyPick(false, cancelled = true)
            } else {
                onFilesPicked(uris)
            }
        }

    private val writePermission: ActivityResultLauncher<String> =
        activity.registerForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted ->
            val pending = pendingDownload
            pendingDownload = null
            if (pending != null) {
                enqueueDownload(pending.first, pending.second, publicDir = granted)
            }
        }

    private var pendingDownload: Pair<String, String>? = null

    fun attach(webView: WebView) {
        this.webView = webView
    }

    // JS interface 默认跑工作线程，SAF 与 evaluateJavascript 都要回 UI 线程
    @JavascriptInterface
    fun pickFolder() {
        activity.runOnUiThread { folderPicker.launch(null) }
    }

    @JavascriptInterface
    fun pickFiles() {
        activity.runOnUiThread { filesPicker.launch(arrayOf("audio/*")) }
    }

    @JavascriptInterface
    fun download(url: String, name: String) {
        activity.runOnUiThread {
            val canWritePublic =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
                    activity.checkSelfPermission(
                        Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    ) == PackageManager.PERMISSION_GRANTED
            if (canWritePublic) {
                enqueueDownload(url, name, publicDir = true)
            } else {
                pendingDownload = url to name
                writePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
    }

    private fun onFolderPicked(treeUri: Uri) {
        val root = DocumentFile.fromTreeUri(activity, treeUri)
        if (root == null || !root.isDirectory) {
            replyPick(false, cancelled = true)
            return
        }
        val folderName = queryDisplayName(treeUri) ?: "导入的音乐"
        val destDir = File(importRoot(), sanitize(folderName))
        Thread {
            val copied = copyTree(root, destDir)
            replyPick(
                ok = copied.isNotEmpty(),
                kind = "folder",
                rootPath = destDir.absolutePath,
                paths = copied.map { it.absolutePath },
            )
        }.start()
    }

    private fun onFilesPicked(uris: List<Uri>) {
        val destDir = File(importRoot(), "files")
        destDir.mkdirs()
        Thread {
            val copied = mutableListOf<File>()
            var done = 0
            for (uri in uris) {
                val name = queryDisplayName(uri) ?: "track_$done"
                val target = File(destDir, sanitize(name))
                if (copyUri(uri, target)) {
                    copied.add(target)
                }
                done += 1
                // 与文件夹导入同频节流，避免多选上千文件时事件轰炸
                if (done % 25 == 0 || done == uris.size) {
                    emitProgress(done, uris.size)
                }
            }
            replyPick(
                ok = copied.isNotEmpty(),
                kind = "files",
                rootPath = destDir.absolutePath,
                paths = copied.map { it.absolutePath },
            )
        }.start()
    }

    private fun copyTree(
        src: DocumentFile,
        destDir: File,
    ): List<File> {
        val entries = mutableListOf<Pair<DocumentFile, File>>()
        collectAudio(src, destDir, entries)
        val total = entries.size
        if (total == 0) {
            return emptyList()
        }
        destDir.mkdirs()
        val copied = mutableListOf<File>()
        var done = 0
        for ((doc, target) in entries) {
            target.parentFile?.mkdirs()
            if (copyUri(doc.uri, target)) {
                copied.add(target)
            }
            done += 1
            // 进度节流，避免大目录导入时界面像卡死
            if (done % 25 == 0 || done == total) {
                emitProgress(done, total)
            }
        }
        return copied
    }

    private fun collectAudio(
        src: DocumentFile,
        base: File,
        out: MutableList<Pair<DocumentFile, File>>,
    ) {
        if (src.isDirectory) {
            for (child in src.listFiles()) {
                val name = child.name ?: continue
                if (child.isDirectory) {
                    collectAudio(child, File(base, sanitize(name)), out)
                } else if (isAudioName(name)) {
                    out.add(child to File(base, sanitize(name)))
                }
            }
        } else if (isAudioName(src.name ?: "")) {
            out.add(src to base)
        }
    }

    private fun copyUri(uri: Uri, target: File): Boolean {
        return try {
            val input = activity.contentResolver.openInputStream(uri) ?: return false
            input.use { source ->
                FileOutputStream(target).use { output -> source.copyTo(output) }
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        return try {
            activity.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun enqueueDownload(url: String, name: String, publicDir: Boolean) {
        val safeName = sanitize(name)
        try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(safeName)
                .setDescription(activity.getString(R.string.app_name))
                .setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
                )
                .setAllowedOverMetered(true)
                .setMimeType(guessMime(safeName))
            if (publicDir) {
                // API 24+ 该方法为 builder 风格（抛 IllegalStateException），写不进由外层 catch 兜底
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    safeName,
                )
            } else {
                request.setDestinationInExternalFilesDir(
                    activity,
                    Environment.DIRECTORY_DOWNLOADS,
                    safeName,
                )
            }
            val manager =
                activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            dispatch(
                "musicstorm:download-started",
                JSONObject().put("name", safeName),
            )
        } catch (e: Exception) {
            dispatch(
                "musicstorm:download-started",
                JSONObject().put("name", safeName).put("error", e.message),
            )
        }
    }

    private fun guessMime(name: String): String {
        val ext = MimeTypeMap.getFileExtensionFromUrl("file://$name")
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            ?: "application/octet-stream"
    }

    private fun isAudioName(name: String): Boolean {
        val ext = name.substringAfterLast('.', "").lowercase()
        return AUDIO_EXT.contains(ext)
    }

    private fun sanitize(name: String): String {
        val cleaned = name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim()
        return cleaned.ifEmpty { "untitled" }
    }

    private fun importRoot(): File {
        return File(activity.filesDir, "import")
    }

    private fun replyPick(
        ok: Boolean,
        cancelled: Boolean = false,
        kind: String = "",
        rootPath: String = "",
        paths: List<String> = emptyList(),
    ) {
        val detail = JSONObject()
            .put("ok", ok)
            .put("cancelled", cancelled)
            .put("kind", kind)
            .put("path", rootPath)
            .put("paths", JSONArray(paths))
        dispatch("musicstorm:saf-picked", detail)
    }

    private fun emitProgress(done: Int, total: Int) {
        dispatch(
            "musicstorm:saf-progress",
            JSONObject().put("done", done).put("total", total),
        )
    }

    private fun dispatch(event: String, detail: JSONObject) {
        val js =
            "window.dispatchEvent(new CustomEvent('$event',{detail:${detail.toString()}}))"
        webView?.post { webView?.evaluateJavascript(js, null) }
    }

    companion object {
        private val AUDIO_EXT = setOf(
            "mp3", "wav", "aac", "m4a", "flac", "ogg", "wma",
            "aif", "aiff", "ape", "alac", "wv", "dsf", "dff", "diff", "tta",
            "mp2", "mp1", "ra", "rm", "ram", "m4p", "opus",
            "mid", "midi", "mod", "xm", "s3m", "it",
            "au", "voc", "cda", "amr", "gsm", "raw", "pcm", "mpga", "3gp", "3g2",
        )
    }
}