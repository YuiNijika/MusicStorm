// localStorage 即时生效 + SQLite 供 Rust 下次启动注入 GPU 参数

import { invoke } from "@tauri-apps/api/core"

const PREF_KEY = "musicstorm-performance-mode"
const SETTING_KEY = "performance_mode"

export const MATERIAL_GLASS_MEMO_KEY = "musicstorm-performance-material-glass"

export const PERFORMANCE_MODE_EVENT = "musicstorm-performance-mode-change"

export function getPerformanceMode(): boolean {
    if (typeof window === "undefined") {
        return false
    }
    try {
        return window.localStorage.getItem(PREF_KEY) === "1"
    } catch {
        return false
    }
}

// 写 localStorage + SQLite；下次启动 Rust 读它决定 GPU 参数
export async function setPerformanceMode(enabled: boolean): Promise<void> {
    try {
        window.localStorage.setItem(PREF_KEY, enabled ? "1" : "0")
    } catch {
        // SQLite 兜底
    }
    // 尽力同步到 SQLite；桌面端失败不影响本次会话
    try {
        await invoke("db_set_setting", {
            key: SETTING_KEY,
            value: enabled ? "1" : "0",
        })
    } catch {
        // 浏览器预览无 tauri 运行时
    }
    window.dispatchEvent(new CustomEvent(PERFORMANCE_MODE_EVENT))
}

export function applyPerformanceModeClass(enabled: boolean): void {
    document.documentElement.classList.toggle("performance-mode", enabled)
}
