import { useEffect, useRef, useState } from "react"

import { usePlayer } from "@/hooks/use-player"
import {
    clearAndroidNowPlaying,
    hasAndroidAudio,
    listenAndroidTransport,
    updateAndroidNowPlaying,
} from "@/lib/android/native-bridge"
import { getCoverOverride } from "@/lib/music/cover-overrides"
import {
    ensureRemoteCoverCached,
    getCachedRemoteCover,
} from "@/lib/music/remote-cover-cache"
import { isAndroid } from "@/lib/platform"
import { isWebMode } from "@/lib/web-mode"

// Android 系统媒体通知（对齐 macOS now-playing hook 的角色）：
// 1. 曲目/状态变化 → updateNowPlaying 推送系统通知（MediaStyle + 锁屏）
// 2. 通知栏/锁屏按钮 → transport-command 事件 → 驱动前端播放器动作
function useAndroidNowPlaying() {
    const {
        currentTrack,
        durationMs,
        isPlaying,
        positionMs,
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

    // 推送元数据：身份变化立即发，否则 5s 节流；进度交给 session 自动外推
    useEffect(() => {
        if (isWebMode() || !isAndroid() || !hasAndroidAudio()) {
            return
        }
        if (!currentTrack) {
            lastIdentityRef.current = ""
            clearAndroidNowPlaying()
            return
        }
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
        if (!identityChanged && now - lastSentAtRef.current < 5_000) {
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
    }, [coverUrl, currentTrack, durationMs, isPlaying, positionMs])
}

export { useAndroidNowPlaying }