import { useEffect, useRef, useState } from "react"

import { usePlayer } from "@/hooks/use-player"
import {
    IN_APP_SHORTCUT_EVENT,
    getInAppShortcuts,
    keydownToInAppShortcut,
    type InAppShortcutMap,
} from "@/lib/app/in-app-shortcut-prefs"

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }
    if (target.isContentEditable) {
        return true
    }
    const tag = target.tagName
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function usePlayerHotkeys() {
    const {
        currentTrack,
        positionMs,
        durationMs,
        volume,
        togglePlay,
        next,
        previous,
        seek,
        setVolume,
    } = usePlayer()
    // 配置随事件热更新；用 ref 供监听闭包读取，避免频繁重挂监听
    const [shortcuts, setShortcuts] = useState<InAppShortcutMap>(() =>
        getInAppShortcuts(),
    )
    const shortcutsRef = useRef(shortcuts)
    shortcutsRef.current = shortcuts

    useEffect(() => {
        function bump() {
            setShortcuts(getInAppShortcuts())
        }
        window.addEventListener(IN_APP_SHORTCUT_EVENT, bump)
        return () => window.removeEventListener(IN_APP_SHORTCUT_EVENT, bump)
    }, [])

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (isTypingTarget(event.target)) {
                return
            }
            if (!currentTrack) {
                return
            }
            const combo = keydownToInAppShortcut(event)
            if (!combo) {
                return
            }
            const map = shortcutsRef.current
            switch (combo) {
                case map.togglePlay:
                    event.preventDefault()
                    togglePlay()
                    break
                case map.seekForward: {
                    event.preventDefault()
                    const total =
                        durationMs > 0 ? durationMs : currentTrack.durationMs
                    seek(Math.min(total, positionMs + 5_000))
                    break
                }
                case map.seekBackward: {
                    event.preventDefault()
                    seek(Math.max(0, positionMs - 5_000))
                    break
                }
                case map.volumeUp: {
                    event.preventDefault()
                    setVolume(Math.min(1, volume + 0.05))
                    break
                }
                case map.volumeDown: {
                    event.preventDefault()
                    setVolume(Math.max(0, volume - 0.05))
                    break
                }
                case map.next:
                    event.preventDefault()
                    next()
                    break
                case map.previous:
                    event.preventDefault()
                    previous()
                    break
                default:
                    break
            }
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [
        currentTrack,
        durationMs,
        next,
        positionMs,
        previous,
        seek,
        setVolume,
        togglePlay,
        volume,
    ])
}

export { usePlayerHotkeys }
