import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"

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

// F12 开关态：Rust 侧查不到 DevTools 是否已打开，用模块级标志维护 toggle，
// 避免重复按 F12 累积出多个 DevTools 进程（面板进程 + 远程调试进程约 270MB）
let devtoolsOpen = false

// 统一开关入口：偏好持久化 + 模块级 open 标志同步 + 实际开合面板。
// 设置页与 F12 共用，避免设置开过面板后 F12 标志仍为关导致首按被吞
function applyDevtoolsEnabled(enabled: boolean): void {
    setDevToolsEnabled(enabled)
    devtoolsOpen = enabled
    if (enabled) {
        void invoke("open_devtools").catch(() => {})
    } else {
        void invoke("close_devtools").catch(() => {})
    }
}

// 仅开发构建生效
function useDevtoolsShortcut(): void {
    useEffect(() => {
        if (!import.meta.env.DEV) {
            return
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "F12" && getDevToolsEnabled()) {
                event.preventDefault()
                if (devtoolsOpen) {
                    devtoolsOpen = false
                    void invoke("close_devtools")
                } else {
                    devtoolsOpen = true
                    void invoke("open_devtools")
                }
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])
}

export {
    DEVTOOLS_EVENT,
    applyDevtoolsEnabled,
    getDevToolsEnabled,
    setDevToolsEnabled,
    useDevtoolsShortcut
}
