import { invoke } from "@tauri-apps/api/core"
import { useEffect, useRef } from "react"

import { usePlayer } from "./use-player"
import { usePlaybackTick } from "@/lib/player/playback-tick"

const MINI_PLAYER_VISIBILITY_EVENT = "musicstorm:mini-player-visibility"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

// 与桌面歌词同步同一模式：仅在 mini 窗口可见时向 Rust 推送状态，
// Rust 缓存一份（供 get_mini_player_state 冷启动读取）并全局广播给 mini 窗口。
// tick 之外，切歌 / 播放状态变化也立即推送。
export function useMiniPlayerSync() {
    const { currentTrack, isPlaying } = usePlayer()
    const { positionMs } = usePlaybackTick()
    const isVisibleRef = useRef(false)

    useEffect(() => {
        if (!isTauriRuntime()) {
            return
        }

        invoke<boolean>("is_mini_player_visible")
            .then((visible) => {
                isVisibleRef.current = visible
            })
            .catch(() => {
                isVisibleRef.current = false
            })
        function onVisibility(event: Event) {
            isVisibleRef.current = (event as CustomEvent<boolean>).detail
        }
        window.addEventListener(MINI_PLAYER_VISIBILITY_EVENT, onVisibility)
        return () =>
            window.removeEventListener(
                MINI_PLAYER_VISIBILITY_EVENT,
                onVisibility,
            )
    }, [])

    useEffect(() => {
        if (!isTauriRuntime()) {
            return
        }

        if (!isVisibleRef.current) {
            return
        }

        const state = {
            title: currentTrack?.title ?? "",
            artist: currentTrack?.artist ?? "",
            coverUrl: currentTrack?.coverUrl || null,
            isPlaying,
            positionMs: Math.round(positionMs),
            durationMs: currentTrack?.durationMs ?? 0,
        }

        invoke("update_mini_player", { state }).catch(() => {
            // Ignore errors when window is not visible
        })
    }, [
        positionMs,
        isPlaying,
        currentTrack?.id,
        currentTrack?.title,
        currentTrack?.artist,
        currentTrack?.coverUrl,
        currentTrack?.durationMs,
    ])
}
