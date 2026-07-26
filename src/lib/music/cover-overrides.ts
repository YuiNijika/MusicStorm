/** 按 trackId 覆盖封面 */

const STORAGE_KEY = "musicstorm-cover-overrides"
const COVER_OVERRIDE_EVENT = "musicstorm-cover-override"

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
    window.dispatchEvent(new Event(COVER_OVERRIDE_EVENT))
}

function getCoverOverride(trackId: string): string | null {
    const url = readMap()[trackId]
    return url?.trim() ? url : null
}

function setCoverOverride(trackId: string, dataUrl: string): void {
    const map = readMap()
    map[trackId] = dataUrl
    writeMap(map)
}

function clearCoverOverride(trackId: string): void {
    const map = readMap()
    delete map[trackId]
    writeMap(map)
}

/** 展示用封面：自定义 > 原 coverUrl */
function resolveTrackCoverUrl(trackId: string, coverUrl: string): string {
    return getCoverOverride(trackId) ?? coverUrl
}

export {
    COVER_OVERRIDE_EVENT,
    clearCoverOverride,
    getCoverOverride,
    resolveTrackCoverUrl,
    setCoverOverride,
}