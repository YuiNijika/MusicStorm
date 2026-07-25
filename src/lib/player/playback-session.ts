/** 播放会话持久化：队列 + 状态，启动续播 */

import type { RepeatMode, Track } from "@/lib/types"

const STORAGE_KEY = "musicstorm-playback-session"

type PlaybackSession = {
    queue: Track[]
    currentIndex: number
    positionMs: number
    volume: number
    isMuted: boolean
    shuffle: boolean
    repeat: RepeatMode
    wasPlaying: boolean
}

function isRepeatMode(value: unknown): value is RepeatMode {
    return value === "off" || value === "all" || value === "one"
}

function isTrack(value: unknown): value is Track {
    if (!value || typeof value !== "object") {
        return false
    }
    const t = value as Track
    return (
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        typeof t.artist === "string" &&
        typeof t.source === "string" &&
        (t.source === "local" || t.source === "netease")
    )
}

function readPlaybackSession(): PlaybackSession | null {
    if (typeof window === "undefined") {
        return null
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return null
        }
        const data = JSON.parse(raw) as Partial<PlaybackSession>
        if (!Array.isArray(data.queue) || data.queue.length === 0) {
            return null
        }
        const queue = data.queue.filter(isTrack)
        if (queue.length === 0) {
            return null
        }
        const currentIndex =
            typeof data.currentIndex === "number" &&
            data.currentIndex >= 0 &&
            data.currentIndex < queue.length
                ? data.currentIndex
                : 0
        return {
            queue,
            currentIndex,
            positionMs:
                typeof data.positionMs === "number" && data.positionMs >= 0
                    ? data.positionMs
                    : 0,
            volume:
                typeof data.volume === "number"
                    ? Math.min(1, Math.max(0, data.volume))
                    : 0.8,
            isMuted: Boolean(data.isMuted),
            shuffle: Boolean(data.shuffle),
            repeat: isRepeatMode(data.repeat) ? data.repeat : "off",
            wasPlaying: Boolean(data.wasPlaying),
        }
    } catch {
        return null
    }
}

function writePlaybackSession(session: PlaybackSession): void {
    if (typeof window === "undefined") {
        return
    }
    try {
        // 网易云 url 会过期，落盘时剥离，恢复时重新解析
        const queue = session.queue.map((track) => {
            if (track.source !== "netease" || !track.url) {
                return track
            }
            const { url: _url, ...rest } = track
            return rest
        })
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...session, queue }),
        )
    } catch {
        // quota / private mode
    }
}

function clearPlaybackSession(): void {
    if (typeof window === "undefined") {
        return
    }
    window.localStorage.removeItem(STORAGE_KEY)
}

export { clearPlaybackSession, readPlaybackSession, writePlaybackSession }
export type { PlaybackSession }