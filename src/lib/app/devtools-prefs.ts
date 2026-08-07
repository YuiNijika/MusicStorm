import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"

/** DevTools 开关持久化：启用后可用 F12 快捷键打开 */

const STORAGE_KEY = "musicstorm-devtools-enabled"
const DEVTOOLS_EVENT = "musicstorm:devtools-enabled"

function getDevToolsEnabled(): boolean {
    if (typeof window === "undefined") {
        return false
    }
    return window.localStorage.getItem(STORAGE_KEY) === "1"
}

function setDevToolsEnabled(enabled: boolean): void {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
    window.dispatchEvent(new Event(DEVTOOLS_EVENT))
}

/** 启用 DevTools 时全局监听 F12 打开开发者工具；仅开发构建生效 */
function useDevtoolsShortcut(): void {
    useEffect(() => {
        if (!import.meta.env.DEV) {
            return
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "F12" && getDevToolsEnabled()) {
                event.preventDefault()
                void invoke("open_devtools")
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])
}

export { DEVTOOLS_EVENT, getDevToolsEnabled, setDevToolsEnabled, useDevtoolsShortcut }
