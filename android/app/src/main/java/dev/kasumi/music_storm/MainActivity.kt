package dev.kasumi.music_storm

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import dev.kasumi.app.KSMAndroidHostServices
import dev.kasumi.app.bridge.KSMDevelopmentEntry
import dev.kasumi.app.bridge.KSMFileSystem
import dev.kasumi.app.bridge.KSMMediaSessionMetadata
import dev.kasumi.app.bridge.KSMWebViewHost
import dev.kasumi.app.bridge.KSMWebViewConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class MainActivity : Activity() {
    private lateinit var hostServices: KSMAndroidHostServices
    private lateinit var webViewHost: KSMWebViewHost
    private lateinit var nativeBridge: MusicStormNativeBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val fileSystem = KSMFileSystem(
            File(filesDir, "data"),
            cacheDir,
            File(cacheDir, "tmp")
        )
        val webViewConfig = KSMWebViewConfig(
            productionEntry = BuildConfig.KSM_WEBVIEW_PRODUCTION_ENTRY,
            developmentEntries = BuildConfig.KSM_WEBVIEW_DEVELOPMENT_ENTRIES.toList(),
            supportedHtmlFiles = BuildConfig.KSM_WEBVIEW_SUPPORTED_HTML_FILES.toList()
        )
        hostServices = KSMAndroidHostServices(
            activity = this,
            allowedExternalOrigins = BuildConfig.KSM_SHELL_ALLOWED_ORIGINS.toSet(),
            fileSystem = fileSystem,
            appVersion = BuildConfig.VERSION_NAME,
            allowedHttpOrigins = BuildConfig.KSM_HTTP_ALLOWED_ORIGINS.toSet()
        )
        webViewHost = KSMWebViewHost(
            activity = this,
            fileSystem = fileSystem,
            hostServices = hostServices,
            entryUrl = KSMDevelopmentEntry.resolve(
                intent,
                BuildConfig.DEBUG,
                webViewConfig
            ),
            allowedCommands = BuildConfig.KSM_COMMANDS.toList(),
            allowedPermissions = BuildConfig.KSM_PERMISSIONS.toList(),
            webViewConfig = webViewConfig,
            debug = BuildConfig.DEBUG,
            plugins = listOf(MusicStormPlugin())
        )
        nativeBridge = MusicStormNativeBridge()
        webViewHost.webView.addJavascriptInterface(nativeBridge, "musicStormNative")

        setContentView(webViewHost.webView)
        webViewHost.start()
        nativeBridge.startPolling()
    }

    override fun onResume() {
        super.onResume()
        if (::webViewHost.isInitialized) {
            webViewHost.onResume()
        }
        if (::nativeBridge.isInitialized) {
            nativeBridge.startPolling()
        }
    }

    override fun onPause() {
        if (::webViewHost.isInitialized) {
            webViewHost.onPause()
        }
        if (::nativeBridge.isInitialized) {
            nativeBridge.stopPolling()
        }
        super.onPause()
    }

    override fun onDestroy() {
        if (::nativeBridge.isInitialized) {
            nativeBridge.stopPolling()
        }
        if (::webViewHost.isInitialized) {
            webViewHost.close()
        }
        if (::hostServices.isInitialized) {
            hostServices.shutdown()
        }
        super.onDestroy()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (::webViewHost.isInitialized) {
            webViewHost.onTrimMemory(level)
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        if (::webViewHost.isInitialized) {
            webViewHost.onLowMemory()
        }
        super.onLowMemory()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (::webViewHost.isInitialized) {
            webViewHost.onWindowFocusChanged(hasFocus)
        }
    }

    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        super.onActivityResult(requestCode, resultCode, data)
        hostServices.handleActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        hostServices.handleRequestPermissionsResult(requestCode, grantResults)
    }

    private inner class MusicStormNativeBridge {
        private val handler = Handler(Looper.getMainLooper())
        private var polling = false
        private var lastState = ""
        private var endedSent = false
        private var lastVolume = 1.0

        private val pollTask = object : Runnable {
            override fun run() {
                if (!polling) {
                    return
                }
                try {
                    val state = hostServices.audioState()
                    val payload = JSONObject()
                        .put("playing", state.playing)
                        .put("prepared", state.playback != "idle")
                        .put("positionMs", state.positionMs)
                        .put("durationMs", state.durationMs ?: 0L)
                    if (state.playing) {
                        endedSent = false
                    } else if (
                        !endedSent &&
                        (state.durationMs ?: 0L) > 0L &&
                        state.positionMs > 0L
                    ) {
                        payload.put("ended", true)
                        endedSent = true
                    }
                    val json = payload.toString()
                    if (json != lastState) {
                        lastState = json
                        dispatchEvent("musicstorm:audio-state", json)
                    }
                } catch (_: Throwable) {
                    // The audio service is best effort while the activity starts.
                }
                handler.postDelayed(this, 500L)
            }
        }

        fun startPolling() {
            if (polling) {
                return
            }
            polling = true
            handler.post(pollTask)
        }

        fun stopPolling() {
            polling = false
            handler.removeCallbacks(pollTask)
        }

        @JavascriptInterface
        fun pickFolder() {
            Thread {
                try {
                    val scope = hostServices.openFolder(listOf("audio/*"))
                    dispatchEvent(
                        "musicstorm:saf-picked",
                        JSONObject()
                            .put("ok", scope != null)
                            .put("cancelled", scope == null)
                            .put("kind", "folder")
                            .put("path", scope?.path ?: JSONObject.NULL)
                            .toString()
                    )
                } catch (error: Throwable) {
                    dispatchEvent(
                        "musicstorm:saf-picked",
                        JSONObject()
                            .put("ok", false)
                            .put("cancelled", false)
                            .put("error", error.message ?: "picker failed")
                            .toString()
                    )
                }
            }.start()
        }

        @JavascriptInterface
        fun pickFiles() {
            Thread {
                try {
                    val scope = hostServices.openFiles(listOf("audio/*"))
                    dispatchEvent(
                        "musicstorm:saf-picked",
                        JSONObject()
                            .put("ok", scope != null)
                            .put("cancelled", scope == null)
                            .put("kind", "files")
                            .put("paths", scope?.files?.let(::JSONArray) ?: JSONArray())
                            .toString()
                    )
                } catch (error: Throwable) {
                    dispatchEvent(
                        "musicstorm:saf-picked",
                        JSONObject()
                            .put("ok", false)
                            .put("cancelled", false)
                            .put("error", error.message ?: "picker failed")
                            .toString()
                    )
                }
            }.start()
        }

        @JavascriptInterface
        fun prepareFile(path: String) {
            try {
                hostServices.loadAudio(normalizePath(path))
            } catch (error: Throwable) {
                dispatchAudioError(error)
            }
        }

        @JavascriptInterface
        fun startPlayback() {
            try {
                hostServices.setAudioPlayback(true)
            } catch (error: Throwable) {
                dispatchAudioError(error)
            }
        }

        @JavascriptInterface
        fun pausePlayback() {
            try {
                hostServices.setAudioPlayback(false)
            } catch (error: Throwable) {
                dispatchAudioError(error)
            }
        }

        @JavascriptInterface
        fun seekPlayback(positionMs: Long, resume: Boolean) {
            try {
                hostServices.seekAudio(positionMs.coerceAtLeast(0L))
                if (resume) {
                    hostServices.setAudioPlayback(true)
                }
            } catch (error: Throwable) {
                dispatchAudioError(error)
            }
        }

        @JavascriptInterface
        fun setPlaybackVolume(volume: Double) {
            try {
                lastVolume = volume.coerceIn(0.0, 1.0)
                hostServices.setAudioVolume(lastVolume)
            } catch (_: Throwable) {
            }
        }

        @JavascriptInterface
        fun setPlaybackMuted(muted: Boolean) {
            try {
                hostServices.setAudioVolume(if (muted) 0.0 else lastVolume)
            } catch (_: Throwable) {
            }
        }

        @JavascriptInterface
        fun stopPlayback() {
            try {
                hostServices.setAudioPlayback(false)
                hostServices.seekAudio(0L)
            } catch (_: Throwable) {
            }
        }

        @JavascriptInterface
        fun setPlaybackActive(active: Boolean) {
            // The host owns background playback; this hook is kept for the web app.
        }

        @JavascriptInterface
        fun updateNowPlaying(
            title: String,
            artist: String,
            album: String,
            durationMs: Long,
            coverUrl: String,
            playing: Boolean,
            positionMs: Long
        ) {
            try {
                hostServices.updateMediaSession(
                    KSMMediaSessionMetadata(
                        title = title,
                        artist = artist,
                        album = album,
                        artwork = coverUrl.ifEmpty { null },
                        durationMs = durationMs,
                        positionMs = positionMs,
                        state = if (playing) "playing" else "paused"
                    )
                )
            } catch (_: Throwable) {
            }
        }

        @JavascriptInterface
        fun clearNowPlaying() {
            try {
                hostServices.clearMediaSession()
            } catch (_: Throwable) {
            }
        }

        @JavascriptInterface
        fun download(url: String, name: String) {
            Thread {
                val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                try {
                    hostServices.download(
                        url,
                        "app://cache/downloads/$safeName",
                        overwrite = true
                    )
                } catch (_: Throwable) {
                }
            }.start()
        }

        private fun normalizePath(path: String): String {
            if (!path.startsWith("https://app.local/__ksm_file")) {
                return path
            }
            return Uri.parse(path).getQueryParameter("path") ?: path
        }

        private fun dispatchAudioError(error: Throwable) {
            dispatchEvent(
                "musicstorm:audio-state",
                JSONObject()
                    .put("playing", false)
                    .put("error", error.message ?: "audio failed")
                    .toString()
            )
        }

        private fun dispatchEvent(name: String, detail: String) {
            if (!::webViewHost.isInitialized) {
                return
            }
            webViewHost.webView.post {
                webViewHost.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent(" +
                        JSONObject.quote(name) +
                        ",{detail:" +
                        detail +
                        "}))",
                    null
                )
            }
        }
    }
}
