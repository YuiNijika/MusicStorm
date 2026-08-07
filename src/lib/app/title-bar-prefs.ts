import type { TitleBarStyle } from "@/components/app/title-bar"

/** 标题栏样式存储键，App 与设置页共用 */
export const TITLE_BAR_STORAGE_KEY = "musicstorm-titlebar-style"

export type SettingsTab =
    | "source"
    | "playback"
    | "account"
    | "appearance"
    | "hotkeys"
    | "update"
    | "other"

/** 读取标题栏样式偏好；非法值回落 mac */
export function readTitleBarStyle(): TitleBarStyle {
    if (typeof window === "undefined") {
        return "mac"
    }
    const stored = window.localStorage.getItem(TITLE_BAR_STORAGE_KEY)
    return stored === "windows" ? "windows" : "mac"
}
