import { invoke } from "@tauri-apps/api/core"

import { isMacOS } from "@/lib/platform"

export const SHORTCUT_ACTIONS = [
    { id: "toggle", label: "播放 / 暂停" },
    { id: "previous", label: "上一首" },
    { id: "next", label: "下一首" },
] as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]["id"]

const WINDOWS_DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
    toggle: "Ctrl+Alt+Space",
    previous: "Ctrl+Alt+Left",
    next: "Ctrl+Alt+Right",
}

// macOS 不默认抢占系统级组合键；应用内播放快捷键遵循 Apple Music。
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = isMacOS()
    ? { toggle: "", previous: "", next: "" }
    : WINDOWS_DEFAULT_SHORTCUTS

type ShortcutConfig = Partial<Record<ShortcutAction, string>>

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function loadGlobalShortcuts(): Promise<Record<ShortcutAction, string>> {
    if (!isTauriRuntime()) {
        return { ...DEFAULT_SHORTCUTS }
    }
    try {
        const raw = await invoke<string | null>("db_get_setting", {
            key: "global_shortcuts",
        })
        if (raw) {
            const parsed = JSON.parse(raw) as ShortcutConfig
            return {
                toggle: parsed.toggle ?? DEFAULT_SHORTCUTS.toggle,
                previous: parsed.previous ?? DEFAULT_SHORTCUTS.previous,
                next: parsed.next ?? DEFAULT_SHORTCUTS.next,
            }
        }
    } catch {
        // 读取失败用默认
    }
    return { ...DEFAULT_SHORTCUTS }
}

export async function updateGlobalShortcut(
    action: ShortcutAction,
    combo: string,
): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    await invoke("update_global_shortcut", { action, combo })
}

// 必须含 Ctrl/Alt/Super 之一，避免单键全局快捷键干扰其他应用
export function keydownToShortcut(event: KeyboardEvent): string | null {
    const mods: string[] = []
    if (event.ctrlKey) mods.push("Ctrl")
    if (event.altKey) mods.push("Alt")
    if (event.shiftKey) mods.push("Shift")
    if (event.metaKey) mods.push("Super")

    const key = codeToKeyName(event.code)
    if (!key) {
        return null
    }
    // F 键可单独注册（全局 F 键冲突少）；其余必须带 Ctrl/Alt/Super
    const isFnKey = /^F\d{1,2}$/.test(key)
    const hasStrongMod = mods.some((m) => m === "Ctrl" || m === "Alt" || m === "Super")
    if (!isFnKey && !hasStrongMod) {
        return null
    }
    return [...mods, key].join("+")
}

export function formatShortcut(combo: string): string {
    if (!isMacOS()) {
        return combo
    }
    const symbols: Record<string, string> = {
        Ctrl: "⌃",
        Alt: "⌥",
        Shift: "⇧",
        Super: "⌘",
        Left: "←",
        Right: "→",
        Up: "↑",
        Down: "↓",
        Space: "Space",
        Esc: "Esc",
    }
    return combo
        .split("+")
        .map((part) => symbols[part] ?? part)
        .join("")
}

function codeToKeyName(code: string): string | null {
    const match = /^Key([A-Z])$/.exec(code)
    if (match) {
        return match[1]
    }
    const digit = /^Digit([0-9])$/.exec(code)
    if (digit) {
        return digit[1]
    }
    const f = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code)
    if (f) {
        return `F${f[1]}`
    }
    switch (code) {
        case "Space":
            return "Space"
        case "ArrowLeft":
            return "Left"
        case "ArrowRight":
            return "Right"
        case "ArrowUp":
            return "Up"
        case "ArrowDown":
            return "Down"
        case "Backquote":
            return "`"
        case "Minus":
            return "-"
        case "Equal":
            return "="
        case "BracketLeft":
            return "["
        case "BracketRight":
            return "]"
        case "Backslash":
            return "\\"
        case "Semicolon":
            return ";"
        case "Quote":
            return "'"
        case "Comma":
            return ","
        case "Period":
            return "."
        case "Slash":
            return "/"
        case "Numpad0":
        case "Numpad1":
        case "Numpad2":
        case "Numpad3":
        case "Numpad4":
        case "Numpad5":
        case "Numpad6":
        case "Numpad7":
        case "Numpad8":
        case "Numpad9":
            return code.slice(-1)
        default:
            return null
    }
}
