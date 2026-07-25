import { useEffect } from "react"

import { usePlayer } from "@/hooks/use-player"

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

/** 全局播放快捷键：空格 / 方向键 / [ ] 音量 */
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

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return
            }
            if (isTypingTarget(event.target)) {
                return
            }
            if (!currentTrack) {
                return
            }

            switch (event.code) {
                case "Space":
                    event.preventDefault()
                    togglePlay()
                    break
                case "ArrowRight": {
                    event.preventDefault()
                    const total = durationMs > 0 ? durationMs : currentTrack.durationMs
                    seek(Math.min(total, positionMs + 5_000))
                    break
                }
                case "ArrowLeft": {
                    event.preventDefault()
                    seek(Math.max(0, positionMs - 5_000))
                    break
                }
                case "ArrowUp": {
                    event.preventDefault()
                    setVolume(Math.min(1, volume + 0.05))
                    break
                }
                case "ArrowDown": {
                    event.preventDefault()
                    setVolume(Math.max(0, volume - 0.05))
                    break
                }
                case "BracketRight":
                    event.preventDefault()
                    next()
                    break
                case "BracketLeft":
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