import { useCallback, useEffect, useRef, useState } from "react"

import { usePlayer } from "@/hooks/use-player"
import {
    clearAndroidNowPlaying,
    hasAndroidAudio,
    listenAndroidTransport,
    setAndroidPlaybackActive,
    updateAndroidNowPlaying,
} from "@/lib/android/native-bridge"
import { getCoverOverride } from "@/lib/music/cover-overrides"
import {
    ensureRemoteCoverCached,
    getCachedRemoteCover,
} from "@/lib/music/remote-cover-cache"
import { isAndroid } from "@/lib/platform"
import { getPlaybackTickSnapshot } from "@/lib/player/playback-tick"
import { isWebMode } from "@/lib/web-mode"

// 进度回推节奏：系统按 session 状态外推位置，但部分 ROM 不外推，
// 播放中每秒回推一次保证通知进度条跟得上；暂停时降频只补状态
const PLAYING_PUSH_INTERVAL_MS = 1_000
const PAUSED_PUSH_INTERVAL_MS = 5_000

// Android 系统媒体通知（对齐 macOS now-playing hook 的角色）：
// 1. 曲目/状态变化 → updateNowPlaying 推送系统通知（MediaStyle + 锁屏）
// 2. 通知栏/锁屏按钮 → transport-command 事件 → 驱动前端播放器动作
function useAndroidNowPlaying() {
    const {
        currentTrack,
        isPlaying,
        togglePlay,
        next,
        previous,
        seek,
    } = usePlayer()
    const [coverUrl, setCoverUrl] = useState<string | null>(null)
    const lastSentAtRef = useRef(0)
    const lastIdentityRef = useRef("")
    // 传输命令回调里 React 状态是异步提交的，用 ref 拿当前真实值，连点不误判
    const isPlayingRef = useRef(isPlaying)
    useEffect(() => {
        isPlayingRef.current = isPlaying
    }, [isPlaying])

    // 通知栏/锁屏媒体键：转成播放器动作；play/pause 只在状态不符时触发，避免双重切换
    useEffect(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio()) {
            return
        }
        return listenAndroidTransport((payload) => {
            switch (payload.command) {
                case "play":
                    if (!isPlayingRef.current) {
                        togglePlay()
                    }
                    break
                case "pause":
                    if (isPlayingRef.current) {
                        togglePlay()
                    }
                    break
                case "next":
                    next()
                    break
                case "previous":
                    previous()
                    break
                case "seek":
                    if (typeof payload.positionMs === "number") {
                        seek(payload.positionMs)
                    }
                    break
                case "stop":
                    if (isPlayingRef.current) {
                        togglePlay()
                    }
                    break
            }
        })
    }, [next, previous, seek, togglePlay])

    // 封面解析：优先真实文件路径（本地复制/缓存缩略图），否则原样传 URL 交给原生侧解码
    useEffect(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio() || !currentTrack) {
            setCoverUrl(null)
            return
        }
        let cancelled = false
        const override = getCoverOverride(currentTrack.id)
        if (override?.thumbnailPath) {
            setCoverUrl(override.thumbnailPath)
            return
        }
        if (/^https?:\/\//i.test(currentTrack.coverUrl)) {
            const cached = getCachedRemoteCover(currentTrack.coverUrl)
            setCoverUrl(cached?.thumbnailPath ?? currentTrack.coverUrl)
            void ensureRemoteCoverCached(currentTrack.coverUrl).then((result) => {
                if (!cancelled && result?.thumbnailPath) {
                    setCoverUrl(result.thumbnailPath)
                }
            })
        } else {
            setCoverUrl(currentTrack.coverUrl)
        }
        return () => {
            cancelled = true
        }
    }, [currentTrack])

    // 推送元数据：身份变化立即发，否则按播放/暂停分档节流回推位置
    const pushNowPlaying = useCallback(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio() || !currentTrack) {
            return
        }
        // 推送瞬间读取最新进度，避免整应用每 tick 重渲
        const { positionMs, durationMs } = getPlaybackTickSnapshot()
        const total = durationMs > 0 ? durationMs : currentTrack.durationMs
        const identity = [
            currentTrack.id,
            currentTrack.title,
            currentTrack.artist,
            currentTrack.album,
            isPlaying ? "playing" : "paused",
            total,
            coverUrl ?? "",
        ].join("\u0000")
        const now = Date.now()
        const identityChanged = identity !== lastIdentityRef.current
        const minInterval = isPlaying
            ? PLAYING_PUSH_INTERVAL_MS
            : PAUSED_PUSH_INTERVAL_MS
        if (!identityChanged && now - lastSentAtRef.current < minInterval) {
            return
        }
        lastIdentityRef.current = identity
        lastSentAtRef.current = now
        updateAndroidNowPlaying({
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: currentTrack.album,
            durationMs: Math.max(0, total),
            coverUrl: coverUrl ?? "",
            playing: isPlaying,
            positionMs: Math.max(0, positionMs),
        })
    }, [coverUrl, currentTrack, isPlaying])

    useEffect(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio()) {
            return
        }
        if (!currentTrack) {
            lastIdentityRef.current = ""
            clearAndroidNowPlaying()
            return
        }
        // 曲目/封面/播放状态变化时立即推送
        pushNowPlaying()
    }, [currentTrack, pushNowPlaying])

    useEffect(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio() || !currentTrack) {
            return
        }
        // 系统通知进度周期刷新；改用定时器而非依赖 tick 重渲
        const timer = window.setInterval(
            pushNowPlaying,
            isPlaying ? PLAYING_PUSH_INTERVAL_MS : PAUSED_PUSH_INTERVAL_MS,
        )
        return () => window.clearInterval(timer)
    }, [currentTrack, isPlaying, pushNowPlaying])

    // H5 引擎的音频跑在 WebView 里，原生侧看不到它的播放态。
    // 不同步的话退后台时 WebView 会把 JS 一起冻结，通知栏切歌与自动切下一首都不会执行
    useEffect(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio()) {
            return
        }
        setAndroidPlaybackActive(isPlaying && currentTrack != null)
        return () => setAndroidPlaybackActive(false)
    }, [isPlaying, currentTrack])
}

export { useAndroidNowPlaying }