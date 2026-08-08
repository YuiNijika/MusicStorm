import { useEffect } from "react"

import { getCloseToTray } from "@/lib/app/close-to-tray-prefs"

// 关闭窗口 → 隐藏到系统托盘继续播放（默认开启）；真正的退出走托盘菜单「退出」
function useCloseToTray() {
    useEffect(() => {
        let unlisten: (() => void) | null = null
        let cancelled = false

        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            if (cancelled) {
                return
            }
            const appWindow = getCurrentWindow()
            void appWindow.onCloseRequested(async (event) => {
                if (!getCloseToTray()) {
                    return
                }
                event.preventDefault()
                await appWindow.hide().catch(() => undefined)
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
    }, [])
}

export { useCloseToTray }
