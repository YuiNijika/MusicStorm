import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react"

export function useWindowControls() {
    const appWindow = useMemo(() => getCurrentWindow(), [])
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        void appWindow.isMaximized().then(setIsMaximized).catch(() => {
            setIsMaximized(false)
        })
    }, [appWindow])

    const minimize = useCallback(() => {
        void appWindow.minimize().catch(() => undefined)
    }, [appWindow])

    const toggleMaximize = useCallback(() => {
        void (async () => {
            try {
                await appWindow.toggleMaximize()
                setIsMaximized(await appWindow.isMaximized())
            } catch {
                // browser preview without tauri runtime
            }
        })()
    }, [appWindow])

    const close = useCallback(() => {
        void appWindow.close().catch(() => undefined)
    }, [appWindow])

    const startDragging = useCallback(
        (event: MouseEvent) => {
            if (event.button !== 0) {
                return
            }
            void appWindow.startDragging().catch(() => undefined)
        },
        [appWindow],
    )

    return {
        isMaximized,
        minimize,
        toggleMaximize,
        close,
        startDragging,
    }
}