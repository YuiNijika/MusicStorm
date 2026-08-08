// 默认开启：关闭窗口 = 隐藏到系统托盘继续播放；退出走托盘菜单「退出」

import { invoke } from "@tauri-apps/api/core"

const PREF_KEY = "musicstorm-close-to-tray"
export const SETTING_KEY = "close_to_tray"
export const CLOSE_TO_TRAY_EVENT = "musicstorm-close-to-tray-change"

export function getCloseToTray(): boolean {
    if (typeof window === "undefined") {
        return true
    }
    try {
        const raw = window.localStorage.getItem(PREF_KEY)
        // 未设置过 → 默认开启（音乐播放器惯例）
        return raw === null ? true : raw === "1"
    } catch {
        return true
    }
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
    try {
        window.localStorage.setItem(PREF_KEY, enabled ? "1" : "0")
    } catch {
        // SQLite 兜底
    }
    try {
        await invoke("db_set_setting", {
            key: SETTING_KEY,
            value: enabled ? "1" : "0",
        })
    } catch {
        // 浏览器预览无 tauri 运行时
    }
    window.dispatchEvent(new CustomEvent(CLOSE_TO_TRAY_EVENT))
}
