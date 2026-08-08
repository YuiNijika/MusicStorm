// 按 trackId 覆盖歌词，优先于网易云与本地原链

const STORAGE_KEY = "musicstorm-lyric-overrides"
const LYRIC_OVERRIDE_EVENT = "musicstorm-lyric-override"

type OverrideMap = Record<string, string>

function readMap(): OverrideMap {
    if (typeof window === "undefined") {
        return {}
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return {}
        }
        const data = JSON.parse(raw) as unknown
        if (!data || typeof data !== "object") {
            return {}
        }
        const out: OverrideMap = {}
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            if (typeof value === "string" && value.trim()) {
                out[key] = value
            }
        }
        return out
    } catch {
        return {}
    }
}

function writeMap(map: OverrideMap): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    window.dispatchEvent(new Event(LYRIC_OVERRIDE_EVENT))
}

function getLyricOverride(trackId: string): string | null {
    const text = readMap()[trackId]
    return text?.trim() ? text : null
}

function setLyricOverride(trackId: string, lrcText: string): void {
    const map = readMap()
    map[trackId] = lrcText
    writeMap(map)
}

function clearLyricOverride(trackId: string): void {
    const map = readMap()
    delete map[trackId]
    writeMap(map)
}

export {
    LYRIC_OVERRIDE_EVENT,
    clearLyricOverride,
    getLyricOverride,
    setLyricOverride,
}