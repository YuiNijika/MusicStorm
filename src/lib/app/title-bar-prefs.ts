import type { TitleBarStyle } from "@/components/app/title-bar"

export const TITLE_BAR_STORAGE_KEY = "musicstorm-titlebar-style"

export type SettingsTab =
    | "source"
    | "playback"
    | "account"
    | "appearance"
    | "hotkeys"
    | "update"
    | "other"

export function readTitleBarStyle(): TitleBarStyle {
    if (typeof window === "undefined") {
        return "mac"
    }
    const stored = window.localStorage.getItem(TITLE_BAR_STORAGE_KEY)
    return stored === "windows" ? "windows" : "mac"
}

// 双击标题栏动作：默认最大化/还原（Windows 惯例）；纯 UI 偏好，仅 localStorage

const DOUBLE_CLICK_PREF_KEY = "musicstorm-titlebar-double-click"

type TitleBarDoubleClickAction = "maximize" | "minimize" | "none"

const TITLE_BAR_DOUBLE_CLICK_OPTIONS: {
    id: TitleBarDoubleClickAction
    label: string
}[] = [
    { id: "maximize", label: "最大化 / 还原" },
    { id: "minimize", label: "最小化" },
    { id: "none", label: "无动作" },
]

function getTitleBarDoubleClickAction(): TitleBarDoubleClickAction {
    if (typeof window === "undefined") {
        return "maximize"
    }
    try {
        const raw = window.localStorage.getItem(DOUBLE_CLICK_PREF_KEY)
        return raw === "minimize" || raw === "none" ? raw : "maximize"
    } catch {
        return "maximize"
    }
}

function setTitleBarDoubleClickAction(action: TitleBarDoubleClickAction): void {
    try {
        window.localStorage.setItem(DOUBLE_CLICK_PREF_KEY, action)
    } catch {
        // 存储不可用时保持默认
    }
}

export {
    TITLE_BAR_DOUBLE_CLICK_OPTIONS,
    getTitleBarDoubleClickAction,
    setTitleBarDoubleClickAction,
}
export type { TitleBarDoubleClickAction }
