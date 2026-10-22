import type { MusicSource } from "@/lib/types"

const LAYOUT_STORAGE_KEY = "musicstorm-full-player-layout"
const DEFAULT_LAYOUT_STORAGE_KEY = "musicstorm-full-player-default-layout"
const CHROME_STORAGE_KEY = "musicstorm-full-player-chrome"
const LAYOUT_EVENT = "musicstorm:full-player-layout"
const CHROME_EVENT = "musicstorm:full-player-chrome"

type FullPlayerLayout = "classic" | "cover" | "lyrics"
type FullPlayerDefaultLayout = "auto" | FullPlayerLayout
type LyricsAlign = "left" | "center" | "right"

type FullPlayerChrome = {
    lyricsAlign: LyricsAlign
    /** 歌词缩放倍率，1 为原始字号 */
    lyricsScale: number
}

const LYRICS_SCALE_MIN = 0.8
const LYRICS_SCALE_MAX = 1.6
const LYRICS_SCALE_STEP = 0.05

const DEFAULT_CHROME: FullPlayerChrome = {
    lyricsAlign: "center",
    lyricsScale: 1,
}

const LYRICS_ALIGNS: {
    id: LyricsAlign
    label: string
}[] = [
    { id: "left", label: "靠左" },
    { id: "center", label: "居中" },
    { id: "right", label: "靠右" },
]

const FULL_PLAYER_LAYOUTS: {
    id: FullPlayerLayout
    label: string
    description: string
}[] = [
    { id: "classic", label: "经典", description: "封面与歌词分栏" },
    { id: "cover", label: "封面", description: "大封面居中" },
    { id: "lyrics", label: "歌词", description: "纯歌词，可调对齐" },
]

const FULL_PLAYER_DEFAULT_LAYOUTS: {
    id: FullPlayerDefaultLayout
    label: string
    description: string
}[] = [
    {
        id: "auto",
        label: "自动",
        description: "B站使用封面，其他来源沿用当前模板",
    },
    ...FULL_PLAYER_LAYOUTS,
]

function isFullPlayerLayout(value: string): value is FullPlayerLayout {
    return value === "classic" || value === "cover" || value === "lyrics"
}

function isFullPlayerDefaultLayout(
    value: string,
): value is FullPlayerDefaultLayout {
    return value === "auto" || isFullPlayerLayout(value)
}

function isLyricsAlign(value: unknown): value is LyricsAlign {
    return value === "left" || value === "center" || value === "right"
}

// 缩放值来自滑杆与快捷键两条写入路径，统一夹取并对齐步进，
// 避免浮点残留让滑杆选中值漂移
function normalizeLyricsScale(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return DEFAULT_CHROME.lyricsScale
    }
    const clamped = Math.min(LYRICS_SCALE_MAX, Math.max(LYRICS_SCALE_MIN, value))
    return Math.round(clamped / LYRICS_SCALE_STEP) * LYRICS_SCALE_STEP
}

function normalizeChrome(partial: Partial<FullPlayerChrome> | Record<string, unknown>): FullPlayerChrome {
    const raw = (partial as Partial<FullPlayerChrome>).lyricsAlign
    return {
        lyricsAlign: isLyricsAlign(raw) ? raw : DEFAULT_CHROME.lyricsAlign,
        lyricsScale: normalizeLyricsScale(
            (partial as Partial<FullPlayerChrome>).lyricsScale,
        ),
    }
}

function getFullPlayerLayout(): FullPlayerLayout {
    if (typeof window === "undefined") {
        return "classic"
    }
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    // 旧版 immersive 迁到 classic
    if (raw === "immersive") {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, "classic")
        return "classic"
    }
    return raw && isFullPlayerLayout(raw) ? raw : "classic"
}

function setFullPlayerLayout(layout: FullPlayerLayout): void {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
    window.dispatchEvent(new CustomEvent(LAYOUT_EVENT))
}

function getFullPlayerDefaultLayout(): FullPlayerDefaultLayout {
    if (typeof window === "undefined") {
        return "auto"
    }
    const raw = window.localStorage.getItem(DEFAULT_LAYOUT_STORAGE_KEY)
    return raw && isFullPlayerDefaultLayout(raw) ? raw : "auto"
}

function setFullPlayerDefaultLayout(layout: FullPlayerDefaultLayout): void {
    window.localStorage.setItem(DEFAULT_LAYOUT_STORAGE_KEY, layout)
    window.dispatchEvent(new CustomEvent(LAYOUT_EVENT))
}

function resolveFullPlayerLayout(
    source: MusicSource,
    fallback: FullPlayerLayout,
): FullPlayerLayout {
    const preference = getFullPlayerDefaultLayout()
    if (preference === "auto") {
        return source === "bilibili" ? "cover" : fallback
    }
    return preference
}

function getFullPlayerChrome(): FullPlayerChrome {
    if (typeof window === "undefined") {
        return DEFAULT_CHROME
    }
    try {
        const raw = window.localStorage.getItem(CHROME_STORAGE_KEY)
        if (!raw) {
            return DEFAULT_CHROME
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return normalizeChrome(parsed)
    } catch {
        return DEFAULT_CHROME
    }
}

function setFullPlayerChrome(chrome: Partial<FullPlayerChrome>): void {
    const next = normalizeChrome({ ...getFullPlayerChrome(), ...chrome })
    window.localStorage.setItem(CHROME_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(CHROME_EVENT))
}

function resetFullPlayerChrome(): void {
    window.localStorage.removeItem(CHROME_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(CHROME_EVENT))
}

export {
    CHROME_EVENT,
    DEFAULT_CHROME,
    FULL_PLAYER_DEFAULT_LAYOUTS,
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    LYRICS_ALIGNS,
    LYRICS_SCALE_MAX,
    LYRICS_SCALE_MIN,
    LYRICS_SCALE_STEP,
    getFullPlayerChrome,
    getFullPlayerDefaultLayout,
    getFullPlayerLayout,
    resetFullPlayerChrome,
    setFullPlayerChrome,
    setFullPlayerDefaultLayout,
    setFullPlayerLayout,
    resolveFullPlayerLayout,
}
export type {
    FullPlayerChrome,
    FullPlayerDefaultLayout,
    FullPlayerLayout,
    LyricsAlign,
}
