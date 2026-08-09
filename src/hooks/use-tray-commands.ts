import { useEffect } from "react"

import { usePlayer } from "@/hooks/use-player"

function useTrayCommands() {
    const {
        currentTrack,
        durationMs,
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

        void import("@tauri-apps/api/event").then(({ listen }) => {
            if (cancelled) {
                return
            }
            void listen<string>("musicstorm:player-command", (event) => {
                switch (event.payload) {
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
                        seek(Math.max(0, positionMs - 5_000))
                        break
                    case "seek-forward": {
                        const total =
                            durationMs > 0
                                ? durationMs
                                : (currentTrack?.durationMs ?? positionMs + 5_000)
                        seek(Math.min(total, positionMs + 5_000))
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
