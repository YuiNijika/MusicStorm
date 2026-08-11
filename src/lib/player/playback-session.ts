import { listLocalPlayableTracks, loadLocalLibrary } from "@/lib/local/library-store"
import type { RepeatMode, Track } from "@/lib/types"
import { isWebMode } from "@/lib/web-mode"

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

function hydrateLocalTracks(queue: Track[]): Track[] {
    const localById = new Map(
        listLocalPlayableTracks(loadLocalLibrary()).map((track) => [track.id, track]),
    )
    return queue.map((track) => {
        if (track.source !== "local") {
            return track
        }
        const current = localById.get(track.id)
        return current ? { ...track, ...current } : track
    })
}

/** 网页版导入的本地曲（id 以 web-local- 开头）依赖 blob URL，每次刷新
 *  重建、无法跨刷新播放；元数据由 IndexedDB 持久化，队列恢复时剔除。 */
function isTrackRestorable(track: Track): boolean {
    if (isWebMode() && track.source === "local" && track.id.startsWith("web-local-")) {
        return false
    }
    return true
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
        const queue = hydrateLocalTracks(
            data.queue.filter(isTrack).filter(isTrackRestorable),
        )
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
        const queue = session.queue.map((track) => {
            if (track.source === "local") {
                // 本地元数据以曲库为准，避免会话长期保存过期歌词/封面快照
                const {
                    lyricText: _lyricText,
                    lrcPath: _lrcPath,
                    coverUrl: _coverUrl,
                    ...rest
                } = track
                // 网页版 blob URL 每次刷新重建，无持久化价值；恢复时队列剔除
                if (isWebMode()) {
                    const { filePath: _filePath, ...webRest } = rest
                    return { ...webRest, coverUrl: "" }
                }
                return { ...rest, coverUrl: "" }
            }
            if (!track.url) {
                return track
            }
            // 网易云 url 会过期，恢复时重新解析
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

export {
    clearPlaybackSession,
    hydrateLocalTracks,
    readPlaybackSession,
    writePlaybackSession,
}
export type { PlaybackSession }