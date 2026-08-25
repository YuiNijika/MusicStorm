import { invoke } from "@tauri-apps/api/core"
import { useEffect, useRef } from "react"
import { usePlayer } from "./use-player"
import { usePlaybackTick } from "@/lib/player/playback-tick"
import { parseLyricText } from "@/lib/lyric/parse"
import { getLyricOverride, LYRIC_OVERRIDE_EVENT } from "@/lib/lyric/overrides"
import { fetchLyricLines } from "@/lib/netease/lyric"
import { getPlayerPreferences, PLAYER_PREFS_EVENT } from "@/lib/player/playback-prefs"
import type { LyricLine } from "@/lib/lyric/parse"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function useDesktopLyricSync() {
    const { currentTrack } = usePlayer()
    const { positionMs } = usePlaybackTick()
    const linesRef = useRef<LyricLine[]>([])
    const overrideTickRef = useRef(0)
    const prefsTickRef = useRef(0)
    const isVisibleRef = useRef(false)

    // Check if desktop lyric is visible
    useEffect(() => {
        if (!isTauriRuntime()) {
            return
        }

        invoke<boolean>("is_desktop_lyric_visible")
            .then((visible) => {
                isVisibleRef.current = visible
            })
            .catch(() => {
                isVisibleRef.current = false
            })
    }, [])

    // Listen for override changes
    useEffect(() => {
        function onOverride() {
            overrideTickRef.current++
        }
        window.addEventListener(LYRIC_OVERRIDE_EVENT, onOverride)
        return () => window.removeEventListener(LYRIC_OVERRIDE_EVENT, onOverride)
    }, [])

    // Listen for preference changes
    useEffect(() => {
        function onPrefs() {
            prefsTickRef.current++
        }
        window.addEventListener(PLAYER_PREFS_EVENT, onPrefs)
        return () => window.removeEventListener(PLAYER_PREFS_EVENT, onPrefs)
    }, [])

    // Load lyrics when track changes
    useEffect(() => {
        if (!currentTrack) {
            linesRef.current = []
            return
        }

        let cancelled = false

        const loadLyrics = async () => {
            try {
                // Check override first
                const override = getLyricOverride(currentTrack.id)
                if (override) {
                    const lines = parseLyricText(override)
                    if (!cancelled) {
                        linesRef.current = lines
                    }
                    return
                }

                // Local track
                if (currentTrack.source === "local") {
                    if (currentTrack.lyricText?.trim()) {
                        const lines = parseLyricText(currentTrack.lyricText)
                        if (!cancelled) {
                            linesRef.current = lines
                        }
                        return
                    }
                    linesRef.current = []
                    return
                }

                // NetEase track
                if (currentTrack.source === "netease" && /^\d+$/.test(currentTrack.id)) {
                    const remote = await fetchLyricLines(
                        currentTrack.id,
                        getPlayerPreferences().showLyricTranslation,
                    )
                    const lines = remote.length > 0
                        ? remote
                        : parseLyricText(currentTrack.lyricText ?? "")
                    if (!cancelled) {
                        linesRef.current = lines
                    }
                    return
                }

                linesRef.current = []
            } catch {
                if (!cancelled) {
                    linesRef.current = []
                }
            }
        }

        void loadLyrics()

        return () => {
            cancelled = true
        }
    }, [currentTrack?.id, currentTrack?.source, currentTrack?.lyricText, overrideTickRef.current, prefsTickRef.current])

    // Update desktop lyric when position or lines change
    useEffect(() => {
        if (!isTauriRuntime()) {
            return
        }

        if (!isVisibleRef.current) {
            return
        }

        const state = {
            positionMs: Math.round(positionMs),
            lines: linesRef.current,
            trackTitle: currentTrack?.title ?? "",
            trackArtist: currentTrack?.artist ?? "",
        }

        invoke("update_desktop_lyric", { state }).catch(() => {
            // Ignore errors when window is not visible
        })
    }, [positionMs, currentTrack?.title, currentTrack?.artist])
}