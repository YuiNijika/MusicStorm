const STORAGE_KEY = "musicstorm-toast"
const TOAST_PREFS_EVENT = "musicstorm-toast-prefs"

// Toast 位置四选一，默认保持历史版本的 bottom-right（老用户习惯）
type ToastPosition = "bottom-right" | "top-right" | "top-center" | "bottom-center"

const TOAST_POSITIONS: { id: ToastPosition; label: string }[] = [
    { id: "bottom-right", label: "右下" },
    { id: "top-right", label: "右上" },
    { id: "bottom-center", label: "下中" },
    { id: "top-center", label: "上中" },
]

type ToastPrefs = {
    position: ToastPosition
    /** 距屏幕边缘的边距（px），0-48 */
    margin: number
}

const DEFAULT_TOAST_PREFS: ToastPrefs = {
    position: "bottom-right",
    margin: 16,
}

function isPosition(value: unknown): value is ToastPosition {
    return (
        typeof value === "string" &&
        TOAST_POSITIONS.some((item) => item.id === value)
    )
}

function readToastPrefs(): ToastPrefs {
    if (typeof window === "undefined") {
        return DEFAULT_TOAST_PREFS
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return DEFAULT_TOAST_PREFS
        }
        const data = JSON.parse(raw) as Partial<ToastPrefs>
        const margin =
            typeof data.margin === "number" && Number.isFinite(data.margin)
                ? Math.min(48, Math.max(0, data.margin))
                : DEFAULT_TOAST_PREFS.margin
        return {
            position: isPosition(data.position)
                ? data.position
                : DEFAULT_TOAST_PREFS.position,
            margin,
        }
    } catch {
        return DEFAULT_TOAST_PREFS
    }
}

function writeToastPrefs(prefs: ToastPrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    // 广播让 Toaster 视口与设置页即时同步
    window.dispatchEvent(new Event(TOAST_PREFS_EVENT))
}

export {
    DEFAULT_TOAST_PREFS,
    TOAST_POSITIONS,
    TOAST_PREFS_EVENT,
    readToastPrefs,
    writeToastPrefs,
}
export type { ToastPosition, ToastPrefs }
