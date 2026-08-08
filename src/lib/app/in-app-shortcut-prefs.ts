export const IN_APP_SHORTCUT_EVENT = "musicstorm-in-app-shortcut-change"

export const IN_APP_ACTIONS = [
    { id: "togglePlay", label: "播放 / 暂停", default: "Space" },
    { id: "seekBackward", label: "快退 5 秒", default: "Left" },
    { id: "seekForward", label: "快进 5 秒", default: "Right" },
    { id: "volumeDown", label: "音量减", default: "Down" },
    { id: "volumeUp", label: "音量加", default: "Up" },
    { id: "previous", label: "上一首", default: "[" },
    { id: "next", label: "下一首", default: "]" },
    { id: "closeFullPlayer", label: "关闭全屏播放", default: "Esc" },
] as const

export type InAppShortcutAction = (typeof IN_APP_ACTIONS)[number]["id"]

const STORAGE_KEY = "musicstorm-in-app-shortcuts"

export type InAppShortcutMap = Record<InAppShortcutAction, string>

export const DEFAULT_IN_APP_SHORTCUTS: InAppShortcutMap = IN_APP_ACTIONS.reduce(
    (acc, item) => {
        acc[item.id] = item.default
        return acc
    },
    {} as InAppShortcutMap,
)

export function getInAppShortcuts(): InAppShortcutMap {
    if (typeof window === "undefined") {
        return { ...DEFAULT_IN_APP_SHORTCUTS }
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return { ...DEFAULT_IN_APP_SHORTCUTS }
        }
        const parsed = JSON.parse(raw) as Partial<InAppShortcutMap>
        return {
            ...DEFAULT_IN_APP_SHORTCUTS,
            ...Object.fromEntries(
                Object.entries(parsed).filter(([key]) =>
                    IN_APP_ACTIONS.some((item) => item.id === key),
                ),
            ),
        } as InAppShortcutMap
    } catch {
        return { ...DEFAULT_IN_APP_SHORTCUTS }
    }
}

export function setInAppShortcut(
    action: InAppShortcutAction,
    combo: string,
): void {
    try {
        const next = { ...getInAppShortcuts(), [action]: combo }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // 存储失败不阻断
    }
    window.dispatchEvent(new CustomEvent(IN_APP_SHORTCUT_EVENT))
}

// 与全局快捷键共用 keydownToShortcut，但允许无修饰单键（应用内快捷键）
export function keydownToInAppShortcut(event: KeyboardEvent): string | null {
    const mods: string[] = []
    if (event.ctrlKey) mods.push("Ctrl")
    if (event.altKey) mods.push("Alt")
    if (event.shiftKey) mods.push("Shift")
    if (event.metaKey) mods.push("Super")

    const key = codeToKeyName(event.code)
    if (!key) {
        return null
    }
    return [...mods, key].join("+")
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
        case "Escape":
            return "Esc"
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
