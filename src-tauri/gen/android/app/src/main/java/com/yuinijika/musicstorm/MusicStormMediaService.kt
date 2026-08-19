package com.yuinijika.musicstorm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder

/**
 * 系统通知栏/锁屏的 MediaStyle 通知 + MediaSession
 * 前端 hook 调桥 updateNowPlaying，桥转发到这里更新通知与 session
 */
class MusicStormMediaService : Service() {
    fun interface Listener {
        fun onTransportCommand(command: String, positionMs: Long?)
    }

    var listener: Listener? = null

    private lateinit var mediaSession: MediaSessionCompat
    private lateinit var notificationManager: NotificationManager
    private var artwork: Bitmap? = null

    // 当前元数据缓存：更新通知与 session 共用一份
    private var nowTitle = ""
    private var nowArtist = ""
    private var nowAlbum = ""
    private var nowDurationMs = 0L
    private var nowPlaying = false
    private var nowPositionMs = 0L
    private var nowCoverUrl = ""

    override fun onCreate() {
        super.onCreate()
        instance = this
        notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createChannel()
        mediaSession = MediaSessionCompat(this, "MusicStormMedia").apply {
            setCallback(sessionCallback)
            // 硬件媒体键（耳机线控）也走 MediaButton → session
            setMediaButtonReceiver(
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                    this@MusicStormMediaService,
                    PlaybackStateCompat.ACTION_PLAY_PAUSE,
                ),
            )
            isActive = true
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") {
            onPlaybackStopped()
            return START_NOT_STICKY
        }
        // startForegroundService 后 5s 内必须 startForeground，否则系统 ANR 崩溃
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        instance = null
        listener = null
        mediaSession.isActive = false
        mediaSession.release()
        super.onDestroy()
    }

    // 通知栏控制只转达不执行：队列在前端，由前端驱动引擎，避免状态两头打架
    private val sessionCallback =
        object : MediaSessionCompat.Callback() {
            override fun onPlay() {
                listener?.onTransportCommand("play", null)
            }

            override fun onPause() {
                listener?.onTransportCommand("pause", null)
            }

            override fun onSkipToNext() {
                listener?.onTransportCommand("next", null)
            }

            override fun onSkipToPrevious() {
                listener?.onTransportCommand("previous", null)
            }

            override fun onSeekTo(pos: Long) {
                listener?.onTransportCommand("seek", pos)
            }

            override fun onStop() {
                listener?.onTransportCommand("stop", null)
            }
        }

    // ---- 桥调用入口 ----

    fun updateNowPlaying(
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
        coverUrl: String,
        playing: Boolean,
        positionMs: Long,
    ) {
        nowTitle = title
        nowArtist = artist
        nowAlbum = album
        nowDurationMs = durationMs
        nowPlaying = playing
        nowPositionMs = positionMs
        val coverChanged = coverUrl != nowCoverUrl
        nowCoverUrl = coverUrl
        mediaSession.isActive = true
        setSessionMetadata()
        setSessionPlaybackState(playing, positionMs, durationMs)
        showNotification()
        if (coverChanged && coverUrl.isNotBlank()) {
            loadArtworkAsync(coverUrl)
        } else if (coverChanged) {
            artwork = null
            showNotification()
        }
    }

    fun onPlaybackStopped() {
        nowPlaying = false
        mediaSession.isActive = false
        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(MEDIA_ACTIONS)
                .setState(PlaybackStateCompat.STATE_NONE, 0L, 0f)
                .build(),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            notificationManager.cancel(NOTIFICATION_ID)
        }
        stopSelf()
    }

    // ---- 内部 ----

    private fun setSessionMetadata() {
        mediaSession.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, nowTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, nowArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, nowAlbum)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, nowDurationMs)
                .build(),
        )
    }

    private fun setSessionPlaybackState(playing: Boolean, positionMs: Long, durationMs: Long) {
        nowPlaying = playing
        nowPositionMs = positionMs
        if (durationMs > 0) {
            nowDurationMs = durationMs
        }
        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(MEDIA_ACTIONS)
                .setState(
                    if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    nowPositionMs,
                    if (playing) 1f else 0f,
                )
                .build(),
        )
    }

    private fun showNotification() {
        // startForeground 应在主线程调用；桥线程/封面线程都可能触发，统一转发
        val refresh =
            Runnable {
                if (instance !== this) {
                    return@Runnable
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // 播放期间维持前台服务，后台/锁屏不中断；暂停时通知保留可一键恢复
                    startForeground(NOTIFICATION_ID, buildNotification())
                } else {
                    notificationManager.notify(NOTIFICATION_ID, buildNotification())
                }
            }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            refresh.run()
        } else {
            Handler(Looper.getMainLooper()).post(refresh)
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java)
        val contentIntent =
            PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE,
            )
        val stopIntent =
            PendingIntent.getService(
                this,
                1,
                Intent(this, MusicStormMediaService::class.java).setAction("stop"),
                PendingIntent.FLAG_IMMUTABLE,
            )
        val subtitle =
            when {
                nowArtist.isNotBlank() && nowAlbum.isNotBlank() -> "$nowArtist · $nowAlbum"
                nowArtist.isNotBlank() -> nowArtist
                nowAlbum.isNotBlank() -> nowAlbum
                else -> "正在播放"
            }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(nowTitle.ifBlank { "MusicStorm" })
            .setContentText(subtitle)
            .setLargeIcon(artwork)
            .setContentIntent(contentIntent)
            .setDeleteIntent(stopIntent)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(nowPlaying)
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .addAction(
                NotificationCompat.Action(
                    android.R.drawable.ic_media_previous,
                    "上一首",
                    MediaButtonReceiver.buildMediaButtonPendingIntent(
                        this,
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
                    ),
                ),
            )
            .addAction(
                NotificationCompat.Action(
                    if (nowPlaying) {
                        android.R.drawable.ic_media_pause
                    } else {
                        android.R.drawable.ic_media_play
                    },
                    if (nowPlaying) "暂停" else "播放",
                    MediaButtonReceiver.buildMediaButtonPendingIntent(
                        this,
                        PlaybackStateCompat.ACTION_PLAY_PAUSE,
                    ),
                ),
            )
            .addAction(
                NotificationCompat.Action(
                    android.R.drawable.ic_media_next,
                    "下一首",
                    MediaButtonReceiver.buildMediaButtonPendingIntent(
                        this,
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT,
                    ),
                ),
            )
            .build()
    }

    private fun createChannel() {
        // NotificationChannel 仅 API 26+ 存在；低版本走旧通知路径，无需建频道
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                "音乐播放",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "正在播放的曲目与播放控制"
                setShowBadge(false)
            }
        notificationManager.createNotificationChannel(channel)
    }

    // 封面在后台线程加载后重建通知；服务已销毁则丢弃，避免对死对象 startForeground 崩溃
    private fun loadArtworkAsync(coverUrl: String) {
        Thread {
            if (instance !== this) {
                return@Thread
            }
            val bitmap = resolveArtwork(coverUrl)
            if (instance !== this || bitmap == null) {
                return@Thread
            }
            artwork = bitmap
            try {
                showNotification()
            } catch (_: Exception) {
            }
        }.start()
    }

    private fun resolveArtwork(coverUrl: String): Bitmap? {
        return try {
            val raw = coverUrl.trim()
            if (raw.isEmpty()) {
                return null
            }
            val bytes: ByteArray? =
                when {
                    raw.startsWith("data:") -> {
                        val comma = raw.indexOf(',')
                        if (comma < 0) {
                            null
                        } else {
                            Base64.decode(raw.substring(comma + 1), Base64.DEFAULT)
                        }
                    }
                    raw.startsWith("asset://") ||
                        raw.startsWith("http://asset.localhost/") -> {
                        val path =
                            if (raw.startsWith("asset://")) {
                                raw.removePrefix("asset://")
                            } else {
                                raw.removePrefix("http://asset.localhost/")
                            }
                        val decoded = URLDecoder.decode(path, "UTF-8")
                        File(decoded).takeIf { it.exists() }?.readBytes()
                    }
                    raw.startsWith("file://") ->
                        File(raw.removePrefix("file://")).takeIf { it.exists() }?.readBytes()
                    raw.startsWith("http://") || raw.startsWith("https://") -> {
                        val conn = URL(raw).openConnection() as HttpURLConnection
                        conn.connectTimeout = 8_000
                        conn.readTimeout = 8_000
                        conn.inputStream.use { it.readBytes() }
                    }
                    else -> File(raw).takeIf { it.exists() }?.readBytes()
                }
            if (bytes == null || bytes.isEmpty()) {
                null
            } else {
                downscale(
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        ?: return null,
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    // 通知大图标限 512px，避免系统降采样造成内存峰值
    private fun downscale(src: Bitmap): Bitmap {
        val max = 512
        val w = src.width
        val h = src.height
        if (w <= max && h <= max) {
            return src
        }
        val scale = max.toFloat() / maxOf(w, h)
        val scaled =
            Bitmap.createScaledBitmap(
                src,
                (w * scale).toInt(),
                (h * scale).toInt(),
                true,
            )
        if (scaled != src) {
            src.recycle()
        }
        return scaled
    }

    companion object {
        const val CHANNEL_ID = "musicstorm-media"
        const val NOTIFICATION_ID = 1

        // 进程内单例：桥直接转发命令，无需跨进程 Binder
        @Volatile
        var instance: MusicStormMediaService? = null
            private set

        private val MEDIA_ACTIONS =
            (
                PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_PLAY_PAUSE or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                    PlaybackStateCompat.ACTION_SEEK_TO or
                    PlaybackStateCompat.ACTION_STOP
            ).toLong()
    }
}