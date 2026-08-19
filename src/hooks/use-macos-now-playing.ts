import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect, useRef, useState } from "react"

import { usePlayer } from "@/hooks/use-player"
import { getCoverOverride } from "@/lib/music/cover-overrides"
import { isWebMode } from "@/lib/web-mode"
import {
    ensureRemoteCoverCached,
    getCachedRemoteCover,
} from "@/lib/music/remote-cover-cache"
import { isNativeMacOS } from "@/lib/platform"
import { getPlaybackTickSnapshot } from "@/lib/player/playback-tick"

type NowPlayingPayload = {
    title: string
    artist: string
    album: string
    durationMs: number
    positionMs: number
    isPlaying: boolean
    queueIndex: number
    queueCount: number
    coverPath: string | null
}

function localCoverPath(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed || /^(?:data:|asset:|blob:|https?:)/i.test(trimmed)) {
        return null
    }
    try {
        return decodeURI(trimmed.replace(/^file:\/\//i, ""))
    } catch {
        return trimmed.replace(/^file:\/\//i, "")
    }
}

function useMacOSNowPlaying() {
    const {
        currentTrack,
        currentIndex,
        queue,
        isPlaying,
    } = usePlayer()
    const [coverPath, setCoverPath] = useState<string | null>(null)
    const lastSentAtRef = useRef(0)
    const lastIdentityRef = useRef("")

    useEffect(() => {
        // 网页版无系统媒体集成
        if (isWebMode() || !isNativeMacOS() || !currentTrack) {
            setCoverPath(null)
            return
        }

        let cancelled = false
        const override = getCoverOverride(currentTrack.id)
        if (override?.thumbnailPath) {
            setCoverPath(override.thumbnailPath)
            return
        }

        if (/^https?:\/\//i.test(currentTrack.coverUrl)) {
            const cached = getCachedRemoteCover(currentTrack.coverUrl)
            setCoverPath(cached?.thumbnailPath ?? null)
            void ensureRemoteCoverCached(currentTrack.coverUrl).then((result) => {
                if (!cancelled) {
                    setCoverPath(result?.thumbnailPath ?? null)
                }
            })
        } else {
            setCoverPath(localCoverPath(currentTrack.coverUrl))
        }

        return () => {
            cancelled = true
        }
    }, [currentTrack])

    const pushNowPlaying = useCallback(() => {
        if (isWebMode() || !isNativeMacOS() || !currentTrack) {
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
            currentIndex,
            queue.length,
            coverPath ?? "",
        ].join("\u0000")
        const now = Date.now()
        const identityChanged = identity !== lastIdentityRef.current
        if (!identityChanged && now - lastSentAtRef.current < 5_000) {
            return
        }

        lastIdentityRef.current = identity
        lastSentAtRef.current = now
        const payload: NowPlayingPayload = {
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: currentTrack.album,
            durationMs: Math.max(0, total),
            positionMs: Math.max(0, positionMs),
            isPlaying,
            queueIndex: Math.max(0, currentIndex),
            queueCount: queue.length,
            coverPath,
        }
        void invoke("macos_now_playing_update", { payload })
    }, [coverPath, currentIndex, currentTrack, isPlaying, queue.length])

    useEffect(() => {
        if (isWebMode() || !isNativeMacOS()) {
            return
        }
        if (!currentTrack) {
            lastIdentityRef.current = ""
            void invoke("macos_now_playing_clear")
            return
        }
        // 曲目/封面/播放状态变化时立即推送
        pushNowPlaying()
    }, [currentTrack, pushNowPlaying])

    useEffect(() => {
        if (isWebMode() || !isNativeMacOS() || !currentTrack) {
            return
        }
        // 锁屏进度周期刷新；改用定时器而非依赖 tick 重渲
        const timer = window.setInterval(pushNowPlaying, 5_000)
        return () => window.clearInterval(timer)
    }, [currentTrack, pushNowPlaying])
}

export { useMacOSNowPlaying }
