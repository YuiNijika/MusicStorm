package com.yuinijika.musicstorm

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
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
 * - musicstorm:audio-state    {playing, prepared, positionMs, durationMs, ended, error}
 * - musicstorm:transport-command {command, positionMs?}  通知栏/锁屏媒体键 → 前端
 *
 * 本地高音质播放对齐桌面 rodio 引擎的角色：桌面走 Rust symphonia/FFmpeg，
 * Android 无该引擎（Cargo/lib.rs 均 cfg 排除），由系统 MediaPlayer 解码，
 * 覆盖 FLAC/ALAC/WAV/OGG/MP3/AAC 等系统支持的格式。
 *
 * 系统媒体通知：播放状态/元数据经 MusicStormMediaService 出 MediaStyle 通知，
 * 该服务只做前台保活 + session 展示，播放仍在本桥；通知栏按钮回调 session 后
 * 以 transport-command 事件交回前端驱动播放器，避免两端状态打架。
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
        scheduleWebViewCacheTrim()
    }

    // ---- 媒体通知：转发前端元数据/状态到 MusicStormMediaService ----
    // 服务同进程单例，命令在其实例就绪后直接转发；未就绪先排队，onCreate 后补发。
    // 通知栏/锁屏按钮回调 session → 转发成 transport-command 事件给前端驱动播放器。
    private val notificationPermission: ActivityResultLauncher<String> =
        activity.registerForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) {
            // 结果不关键：未授权只是不显示通知，播放不受影响
        }

    private var notificationPermissionAsked = false
    private var mediaService: MusicStormMediaService? = null
    private val pendingMediaCommands =
        mutableListOf<(MusicStormMediaService) -> Unit>()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val mediaListener =
        MusicStormMediaService.Listener { command, positionMs ->
            dispatchTransport(command, positionMs)
        }

    private fun mediaService(): MusicStormMediaService? {
        val live = MusicStormMediaService.instance
        // 服务 stop 重建后实例变化，须重新绑定监听并刷新缓存引用
        if (mediaService !== live) {
            mediaService = live
            live?.listener = mediaListener
        }
        return mediaService
    }

    private fun ensureMediaService() {
        if (MusicStormMediaService.instance != null) {
            drainMediaCommands()
            return
        }
        val intent = Intent(activity, MusicStormMediaService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(intent)
        } else {
            activity.startService(intent)
        }
        // onCreate 后实例立即可用；排队命令补发
        mainHandler.postDelayed({ drainMediaCommands() }, 100)
    }

    private fun routeMedia(block: (MusicStormMediaService) -> Unit) {
        val svc = mediaService()
        if (svc != null) {
            block(svc)
            return
        }
        synchronized(pendingMediaCommands) {
            pendingMediaCommands.add(block)
        }
        ensureMediaService()
    }

    private fun drainMediaCommands() {
        val svc = mediaService() ?: return
        val pending: List<(MusicStormMediaService) -> Unit>
        synchronized(pendingMediaCommands) {
            pending = pendingMediaCommands.toList()
            pendingMediaCommands.clear()
        }
        pending.forEach { it(svc) }
    }

    private fun dispatchTransport(command: String, positionMs: Long?) {
        val detail = JSONObject().put("command", command)
        if (positionMs != null) {
            detail.put("positionMs", positionMs)
        }
        dispatch("musicstorm:transport-command", detail)
    }

    private fun maybeRequestNotificationPermission() {
        if (notificationPermissionAsked) {
            return
        }
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                activity.checkSelfPermission(
                    Manifest.permission.POST_NOTIFICATIONS,
                ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionAsked = true
            // JS 接口线程非主线程，launcher.launch 必须回 UI 线程
            activity.runOnUiThread {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    // ---- 本地高音质播放：系统 MediaPlayer ----
    // 控制指令全部投递到专属 HandlerThread：listener 回调要求线程带 Looper，
    // 且 prepare/seek/start 在单线程串行化，避免与 JS 桥线程抢状态。
    // 播放状态经 musicstorm:audio-state 事件回传，前端引擎据此驱动进度条。
    private val mediaThread = HandlerThread("MusicStormMedia").apply { start() }
    private val mediaHandler = Handler(mediaThread.looper)
    private var mediaPlayer: MediaPlayer? = null
    private var mediaVolume = 1f
    private var mediaMuted = false
    private var mediaGen = 0
    private var mediaPrepared = false
    private var mediaPendingSeekMs: Int? = null
    private var mediaTicker: Runnable? = null

    @JavascriptInterface
    fun prepareFile(path: String) {
        mediaHandler.post { prepareOnMediaThread(path) }
    }

    @JavascriptInterface
    fun startPlayback() {
        maybeRequestNotificationPermission()
        ensureMediaService()
        mediaHandler.post {
            val mp = mediaPlayer ?: return@post
            if (!mediaPrepared) {
                return@post
            }
            mediaPendingSeekMs?.let { pending ->
                mediaPendingSeekMs = null
                try {
                    mp.seekTo(pending)
                } catch (_: Exception) {
                }
            }
            requestAudioFocus()
            try {
                mp.start()
            } catch (e: Exception) {
                dispatchState(playing = false, error = e.message ?: "播放失败")
                return@post
            }
            beginTick()
            dispatchState(playing = true)
        }
    }

    @JavascriptInterface
    fun pausePlayback() {
        mediaHandler.post {
            val mp = mediaPlayer
            if (mp != null && mp.isPlaying) {
                try {
                    mp.pause()
                } catch (_: Exception) {
                }
            }
            stopTick()
            dispatchState(playing = false)
        }
    }

    @JavascriptInterface
    fun seekPlayback(positionMs: Double, resume: Boolean) {
        val targetMs = positionMs.toLong().coerceAtLeast(0L).toInt()
        mediaHandler.post {
            val mp = mediaPlayer
            if (!mediaPrepared || mp == null) {
                mediaPendingSeekMs = targetMs
                return@post
            }
            val bounded = targetMs.coerceAtMost(mp.duration.coerceAtLeast(0))
            try {
                mp.seekTo(bounded)
            } catch (_: Exception) {
            }
            dispatchState(
                playing = mp.isPlaying,
                positionMs = bounded.toLong(),
                durationMs = mp.duration.coerceAtLeast(0).toLong(),
            )
            if (resume && !mp.isPlaying) {
                requestAudioFocus()
                try {
                    mp.start()
                } catch (_: Exception) {
                }
                beginTick()
                dispatchState(playing = true)
            }
        }
    }

    @JavascriptInterface
    fun setPlaybackVolume(volume: Double) {
        mediaVolume = volume.toFloat().coerceIn(0f, 1f)
        applyMediaVolume()
    }

    @JavascriptInterface
    fun setPlaybackMuted(muted: Boolean) {
        mediaMuted = muted
        applyMediaVolume()
    }

    @JavascriptInterface
    fun stopPlayback() {
        mediaHandler.post { stopMedia() }
    }

    @JavascriptInterface
    fun isMediaPrepared(): Boolean = mediaPrepared

    @JavascriptInterface
    fun isMediaPlaying(): Boolean {
        return try {
            mediaPlayer?.isPlaying ?: false
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun getMediaPosition(): Double {
        return try {
            mediaPlayer?.currentPosition?.coerceAtLeast(0)?.toDouble() ?: 0.0
        } catch (_: Exception) {
            0.0
        }
    }

    @JavascriptInterface
    fun getMediaDuration(): Double {
        return try {
            mediaPlayer?.duration?.coerceAtLeast(0)?.toDouble() ?: 0.0
        } catch (_: Exception) {
            0.0
        }
    }

    // 前端 hook 每次曲目/状态变化时推送元数据，驱动系统通知与锁屏展示。
    // 未播放时浏览曲目不建前台服务/通知；播放中则推送暂停态也保留通知。
    @JavascriptInterface
    fun updateNowPlaying(
        title: String,
        artist: String,
        album: String,
        durationMs: Double,
        coverUrl: String,
        playing: Boolean,
        positionMs: Double,
    ) {
        if (!playing && MusicStormMediaService.instance == null) {
            return
        }
        maybeRequestNotificationPermission()
        routeMedia { svc ->
            svc.updateNowPlaying(
                title,
                artist,
                album,
                durationMs.toLong().coerceAtLeast(0L),
                coverUrl,
                playing,
                positionMs.toLong().coerceAtLeast(0L),
            )
        }
    }

    @JavascriptInterface
    fun clearNowPlaying() {
        if (MusicStormMediaService.instance == null) {
            return
        }
        routeMedia { it.onPlaybackStopped() }
    }

    private fun prepareOnMediaThread(path: String) {
        val gen = ++mediaGen
        stopMedia()
        if (gen != mediaGen) {
            return
        }
        mediaPrepared = false
        mediaPendingSeekMs = null
        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            mp.setDataSource(path)
            mp.setOnCompletionListener {
                mediaHandler.post {
                    if (gen != mediaGen) {
                        return@post
                    }
                    mediaPrepared = false
                    stopTick()
                    abandonAudioFocus()
                    dispatchState(
                        playing = false,
                        ended = true,
                        positionMs = mp.duration.coerceAtLeast(0).toLong(),
                        durationMs = mp.duration.coerceAtLeast(0).toLong(),
                    )
                }
            }
            mp.setOnErrorListener { _, what, extra ->
                mediaHandler.post {
                    if (gen != mediaGen) {
                        return@post
                    }
                    mediaPrepared = false
                    stopTick()
                    abandonAudioFocus()
                    dispatchState(playing = false, error = "MediaPlayer $what/$extra")
                }
                true
            }
            mp.prepare()
            if (gen != mediaGen) {
                mp.release()
                return
            }
            mediaPlayer = mp
            mediaPrepared = true
            dispatchState(
                playing = false,
                prepared = true,
                positionMs = 0,
                durationMs = mp.duration.coerceAtLeast(0).toLong(),
            )
        } catch (e: Exception) {
            if (gen == mediaGen) {
                dispatchState(playing = false, error = e.message ?: "无法解码该音频")
            }
            try {
                mp.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun stopMedia() {
        stopTick()
        val mp = mediaPlayer
        mediaPlayer = null
        mediaPrepared = false
        mediaPendingSeekMs = null
        abandonAudioFocus()
        if (mp != null) {
            try {
                mp.stop()
            } catch (_: Exception) {
            }
            mp.release()
        }
    }

    private fun applyMediaVolume() {
        val level = if (mediaMuted) 0f else mediaVolume
        mediaHandler.post {
            mediaPlayer?.setVolume(level, level)
        }
    }

    private val audioFocusListener =
        AudioManager.OnAudioFocusChangeListener { change ->
            mediaHandler.post {
                val mp = mediaPlayer ?: return@post
                when (change) {
                    AudioManager.AUDIOFOCUS_LOSS -> {
                        stopMedia()
                        dispatchState(playing = false)
                    }
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                        if (mp.isPlaying) {
                            try {
                                mp.pause()
                            } catch (_: Exception) {
                            }
                            stopTick()
                            dispatchState(playing = false)
                        }
                    }
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                        val duck = if (mediaMuted) 0f else mediaVolume * 0.3f
                        mp.setVolume(duck, duck)
                    }
                    AudioManager.AUDIOFOCUS_GAIN -> {
                        val level = if (mediaMuted) 0f else mediaVolume
                        mp.setVolume(level, level)
                    }
                }
            }
        }

    private fun requestAudioFocus() {
        val am =
            activity.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                ?: return
        am.requestAudioFocus(
            audioFocusListener,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN,
        )
    }

    private fun abandonAudioFocus() {
        val am =
            activity.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                ?: return
        am.abandonAudioFocus(audioFocusListener)
    }

    // 播放中每 500ms 回传一次进度；暂停/切曲时移除回调，避免空转
    private fun beginTick() {
        stopTick()
        val ticker =
            object : Runnable {
                override fun run() {
                    if (mediaGen == 0) {
                        return
                    }
                    val mp = mediaPlayer ?: return
                    if (!mp.isPlaying) {
                        return
                    }
                    dispatchState(
                        playing = true,
                        positionMs = mp.currentPosition.coerceAtLeast(0).toLong(),
                        durationMs = mp.duration.coerceAtLeast(0).toLong(),
                    )
                    mediaHandler.postDelayed(this, 500)
                }
            }
        mediaTicker = ticker
        mediaHandler.post(ticker)
    }

    private fun stopTick() {
        mediaTicker?.let { mediaHandler.removeCallbacks(it) }
        mediaTicker = null
    }

    private fun dispatchState(
        playing: Boolean = false,
        prepared: Boolean = false,
        positionMs: Long = 0,
        durationMs: Long = 0,
        ended: Boolean = false,
        error: String? = null,
    ) {
        val detail = JSONObject()
            .put("playing", playing)
            .put("prepared", prepared)
            .put("positionMs", positionMs)
            .put("durationMs", durationMs)
            .put("ended", ended)
        if (error != null) {
            detail.put("error", error)
        }
        dispatch("musicstorm:audio-state", detail)
    }

    fun destroy() {
        mediaHandler.post {
            stopMedia()
            mediaThread.quitSafely()
        }
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

    // WebView 的 HTTP 磁盘缓存无上限，长期播放/浏览会把内部存储撑爆；
    // 本地封面走 Rust 磁盘缓存、接口响应走 SQLite，WebView 缓存可安全整清。
    private fun scheduleWebViewCacheTrim() {
        webView?.postDelayed(
            {
                val cacheDir = activity.cacheDir ?: return@postDelayed
                if (directorySizeBytes(cacheDir) <= WEBVIEW_CACHE_TRIM_THRESHOLD) {
                    return@postDelayed
                }
                // 不清 localStorage/IndexedDB，只回收网络资源缓存
                webView?.clearCache(true)
            },
            WEBVIEW_CACHE_TRIM_DELAY_MS,
        )
    }

    private fun directorySizeBytes(dir: File): Long {
        var total = 0L
        dir.walkTopDown().forEach { file ->
            if (file.isFile) {
                total += file.length()
            }
        }
        return total
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
        webView?.post {
            try {
                webView?.evaluateJavascript(js, null)
            } catch (_: Exception) {
                // Activity 已销毁，丢弃事件
            }
        }
    }

    companion object {
        // 启动 15s 后（避开首屏关键路径）检查一次 WebView 缓存
        private const val WEBVIEW_CACHE_TRIM_DELAY_MS = 15_000L
        // 超过 64MB 才清理，避免每次冷启动都清、封面重复下载
        private const val WEBVIEW_CACHE_TRIM_THRESHOLD = 64L * 1024 * 1024

        private val AUDIO_EXT = setOf(
            "mp3", "wav", "aac", "m4a", "flac", "ogg", "wma",
            "aif", "aiff", "ape", "alac", "wv", "dsf", "dff", "diff", "tta",
            "mp2", "mp1", "ra", "rm", "ram", "m4p", "opus",
            "mid", "midi", "mod", "xm", "s3m", "it",
            "au", "voc", "cda", "amr", "gsm", "raw", "pcm", "mpga", "3gp", "3g2",
        )
    }
}