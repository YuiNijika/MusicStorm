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
