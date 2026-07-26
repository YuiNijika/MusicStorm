/** 全屏播放器布局模板 + 歌词对齐 */

const LAYOUT_STORAGE_KEY = "musicstorm-full-player-layout"
const CHROME_STORAGE_KEY = "musicstorm-full-player-chrome"
const LAYOUT_EVENT = "musicstorm:full-player-layout"
const CHROME_EVENT = "musicstorm:full-player-chrome"

type FullPlayerLayout = "classic" | "cover" | "lyrics"
type LyricsAlign = "left" | "center" | "right"

/** 歌词模式对齐，不显示封面 */
type FullPlayerChrome = {
    lyricsAlign: LyricsAlign
}

const DEFAULT_CHROME: FullPlayerChrome = {
    lyricsAlign: "center",
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

function isFullPlayerLayout(value: string): value is FullPlayerLayout {
    return value === "classic" || value === "cover" || value === "lyrics"
}

function isLyricsAlign(value: unknown): value is LyricsAlign {
    return value === "left" || value === "center" || value === "right"
}

function normalizeChrome(partial: Partial<FullPlayerChrome> | Record<string, unknown>): FullPlayerChrome {
    const raw = (partial as Partial<FullPlayerChrome>).lyricsAlign
    return {
        lyricsAlign: isLyricsAlign(raw) ? raw : DEFAULT_CHROME.lyricsAlign,
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
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    LYRICS_ALIGNS,
    getFullPlayerChrome,
    getFullPlayerLayout,
    resetFullPlayerChrome,
    setFullPlayerChrome,
    setFullPlayerLayout,
}
export type { FullPlayerChrome, FullPlayerLayout, LyricsAlign }