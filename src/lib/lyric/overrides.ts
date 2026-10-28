// 按 trackId 覆盖歌词，优先于网易云与本地原链

const STORAGE_KEY = "musicstorm-lyric-overrides"
const TRANSLATION_STORAGE_KEY = "musicstorm-lyric-translation-overrides"
const LYRIC_OVERRIDE_EVENT = "musicstorm-lyric-override"

type OverrideMap = Record<string, string>

function readMap(storageKey: string): OverrideMap {
    if (typeof window === "undefined") {
        return {}
    }
    try {
        const raw = window.localStorage.getItem(storageKey)
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

function writeMap(storageKey: string, map: OverrideMap): void {
    window.localStorage.setItem(storageKey, JSON.stringify(map))
    window.dispatchEvent(new Event(LYRIC_OVERRIDE_EVENT))
}

function getLyricOverride(trackId: string): string | null {
    const text = readMap(STORAGE_KEY)[trackId]
    return text?.trim() ? text : null
}

function getLyricTranslationOverride(trackId: string): string | null {
    const text = readMap(TRANSLATION_STORAGE_KEY)[trackId]
    return text?.trim() ? text : null
}

function hasLyricTranslationOverride(trackId: string): boolean {
    return Object.prototype.hasOwnProperty.call(
        readMap(TRANSLATION_STORAGE_KEY),
        trackId,
    )
}

function setLyricOverride(trackId: string, lrcText: string): void {
    const map = readMap(STORAGE_KEY)
    map[trackId] = lrcText
    writeMap(STORAGE_KEY, map)
    const translations = readMap(TRANSLATION_STORAGE_KEY)
    if (translations[trackId]) {
        delete translations[trackId]
        writeMap(TRANSLATION_STORAGE_KEY, translations)
    }
}

function setLyricTranslationOverride(trackId: string, lrcText: string): void {
    const map = readMap(TRANSLATION_STORAGE_KEY)
    map[trackId] = lrcText
    writeMap(TRANSLATION_STORAGE_KEY, map)
}

function clearLyricOverride(trackId: string): void {
    const map = readMap(STORAGE_KEY)
    delete map[trackId]
    writeMap(STORAGE_KEY, map)
    const translations = readMap(TRANSLATION_STORAGE_KEY)
    if (translations[trackId]) {
        delete translations[trackId]
        writeMap(TRANSLATION_STORAGE_KEY, translations)
    }
}

export {
    LYRIC_OVERRIDE_EVENT,
    clearLyricOverride,
    getLyricOverride,
    getLyricTranslationOverride,
    hasLyricTranslationOverride,
    setLyricOverride,
    setLyricTranslationOverride,
}
