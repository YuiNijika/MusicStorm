import { useSyncExternalStore } from "react"

// 播放进度单独存放，避免 200ms tick 让整个 PlayerContext 换引用
// 导致全应用每帧重渲；只有真正显示进度的组件才订阅。
type PlaybackTick = {
    positionMs: number
    durationMs: number
}

let snapshot: PlaybackTick = { positionMs: 0, durationMs: 0 }
const listeners = new Set<() => void>()

function setPlaybackTick(next: PlaybackTick) {
    if (
        snapshot.positionMs === next.positionMs &&
        snapshot.durationMs === next.durationMs
    ) {
        return
    }
    snapshot = next
    for (const listener of listeners) {
        listener()
    }
}

function subscribePlaybackTick(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

function getPlaybackTickSnapshot(): PlaybackTick {
    return snapshot
}

/** 响应式订阅：值变化才重渲，供进度条/歌词等每 tick 需要刷新的组件使用 */
function usePlaybackTick(): PlaybackTick {
    return useSyncExternalStore(subscribePlaybackTick, getPlaybackTickSnapshot, getPlaybackTickSnapshot)
}

export { getPlaybackTickSnapshot, setPlaybackTick, usePlaybackTick }
export type { PlaybackTick }