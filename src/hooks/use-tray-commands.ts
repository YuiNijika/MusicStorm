import { useEffect } from "react"

import { usePlayer } from "@/hooks/use-player"

function useTrayCommands() {
    const { togglePlay, next, previous } = usePlayer()

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
    }, [togglePlay, next, previous])
}

export { useTrayCommands }
