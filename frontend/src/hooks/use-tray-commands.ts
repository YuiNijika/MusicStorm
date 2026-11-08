import { useEffect, useRef } from "react"

import { usePlayer } from "@/hooks/use-player"
import { getPlaybackTickSnapshot } from "@/lib/player/playback-tick"
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
        isPlaying,
        volume,
        togglePlay,
        next,
        previous,
        seek,
        setVolume,
    } = usePlayer()

    // 命令处理读 ref 快照：监听只注册一次，
    // 否则每次音量变化/切歌都会重挂，重挂窗口内托盘命令直接丢失
    const stateRef = useRef({ currentTrack, isPlaying, volume })
    const actionsRef = useRef({ togglePlay, next, previous, seek, setVolume })
    stateRef.current = { currentTrack, isPlaying, volume }
    actionsRef.current = { togglePlay, next, previous, seek, setVolume }

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
                // 事件发生时读取最新进度，避免监听因 tick 重挂
                const { positionMs, durationMs } = getPlaybackTickSnapshot()
                const { currentTrack, isPlaying, volume } = stateRef.current
                const {
                    togglePlay,
                    next,
                    previous,
                    seek,
                    setVolume,
                } = actionsRef.current
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖全部走 ref 快照，只注册一次
    }, [])
}

export { useTrayCommands }
