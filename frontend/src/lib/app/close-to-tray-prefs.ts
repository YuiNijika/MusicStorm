// 关闭窗口行为两个维度，都是 localStorage 即时生效 + SQLite 兜底持久化：
// 行为（托盘/退出）与是否先询问。默认开启询问，用户勾选「不再提示」后
// 走记忆行为直接执行；设置页两个开关与对话框双向同步。

import { invoke } from "@tauri-apps/api/core"

const PREF_KEY = "musicstorm-close-to-tray"
export const SETTING_KEY = "close_to_tray"
export const CLOSE_TO_TRAY_EVENT = "musicstorm-close-to-tray-change"

const ASK_PREF_KEY = "musicstorm-close-ask"
export const ASK_SETTING_KEY = "close_ask"
export const CLOSE_ASK_EVENT = "musicstorm-close-ask-change"

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

export function getCloseAsk(): boolean {
    if (typeof window === "undefined") {
        return true
    }
    try {
        const raw = window.localStorage.getItem(ASK_PREF_KEY)
        // 未设置过 → 默认询问
        return raw === null ? true : raw === "1"
    } catch {
        return true
    }
}

export async function setCloseAsk(ask: boolean): Promise<void> {
    try {
        window.localStorage.setItem(ASK_PREF_KEY, ask ? "1" : "0")
    } catch {
        // SQLite 兜底
    }
    try {
        await invoke("db_set_setting", {
            key: ASK_SETTING_KEY,
            value: ask ? "1" : "0",
        })
    } catch {
        // 浏览器预览无 tauri 运行时
    }
    window.dispatchEvent(new CustomEvent(CLOSE_ASK_EVENT))
}
