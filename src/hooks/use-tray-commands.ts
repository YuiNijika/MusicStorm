import { useEffect } from "react"

import { usePlayer } from "@/hooks/use-player"
import { isWebMode } from "@/lib/web-mode"

type PlayerCommandPayload =
    | string
    | {
          action?: string
          positionMs?: number | null
      }

function useTrayCommands() {
    const {
        currentTrack,
        durationMs,
        isPlaying,
        positionMs,
        volume,
        togglePlay,
        next,
        previous,
        seek,
        setVolume,
    } = usePlayer()

    useEffect(() => {
        let unlisten: (() => void) | null = null
        let cancelled = false

        // 网页版无托盘事件源
        if (isWebMode()) {
            return () => {
                cancelled = true
            }
        }

        void import("@tauri-apps/api/event").then(({ listen }) => {
            if (cancelled) {
                return
            }
            void listen<PlayerCommandPayload>("musicstorm:player-command", (event) => {
                const action =
                    typeof event.payload === "string"
                        ? event.payload
                        : event.payload.action
                const requestedPosition =
                    typeof event.payload === "string"
                        ? null
                        : event.payload.positionMs
                switch (action) {
                    case "play":
                        if (!isPlaying) {
                            togglePlay()
                        }
                        break
                    case "pause":
                        if (isPlaying) {
                            togglePlay()
                        }
                        break
                    case "toggle":
                        togglePlay()
                        break
                    case "previous":
                        previous()
                        break
                    case "next":
                        next()
                        break
                    case "seek-backward":
                        seek(Math.max(0, positionMs - (requestedPosition ?? 5_000)))
                        break
                    case "seek-forward": {
                        const total =
                            durationMs > 0
                                ? durationMs
                                : (currentTrack?.durationMs ?? positionMs + 5_000)
                        seek(
                            Math.min(
                                total,
                                positionMs + (requestedPosition ?? 5_000),
                            ),
                        )
                        break
                    }
                    case "seek-to": {
                        if (typeof requestedPosition !== "number") {
                            break
                        }
                        const total =
                            durationMs > 0
                                ? durationMs
                                : (currentTrack?.durationMs ?? requestedPosition)
                        seek(Math.min(total, Math.max(0, requestedPosition)))
                        break
                    }
                    case "volume-up":
                        setVolume(Math.min(1, volume + 0.05))
                        break
                    case "volume-down":
                        setVolume(Math.max(0, volume - 0.05))
                        break
                    case "show":
                    default:
                        break
                }
            }).then((stop) => {
                if (cancelled) {
                    stop()
                } else {
                    unlisten = stop
                }
            })
        })

        return () => {
            cancelled = true
            unlisten?.()
        }
    }, [
        currentTrack,
        durationMs,
        isPlaying,
        next,
        positionMs,
        previous,
        seek,
        setVolume,
        togglePlay,
        volume,
    ])
}

export { useTrayCommands }
