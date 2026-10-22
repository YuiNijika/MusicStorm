import type { Track } from "@/lib/types"

const CLOUD_ORDER_STORAGE_KEY = "musicstorm.playlist.cloud-order"
const CLOUD_PENDING_STORAGE_KEY = "musicstorm.playlist.cloud-pending"
const MAX_TRACK_IDS = 5_000
const MAX_PLAYLISTS = 200

type CloudOrderMap = Record<string, string[]>

function readCloudOrderMap(): CloudOrderMap {
    if (typeof window === "undefined") {
        return {}
    }
    try {
        const raw = window.localStorage.getItem(CLOUD_ORDER_STORAGE_KEY)
        if (!raw) {
            return {}
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const result: CloudOrderMap = {}
        for (const [playlistId, value] of Object.entries(parsed)) {
            if (Array.isArray(value)) {
                result[playlistId] = [...new Set(value.filter(
                    (id): id is string => typeof id === "string",
                ))].slice(0, MAX_TRACK_IDS)
            }
        }
        return result
    } catch {
        return {}
    }
}

function writeCloudOrderMap(map: CloudOrderMap): void {
    try {
        const entries = Object.entries(map).slice(-MAX_PLAYLISTS)
        window.localStorage.setItem(
            CLOUD_ORDER_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(entries)),
        )
    } catch {
        // 存储不可用时仍按云端返回顺序展示
    }
}

function readPendingMap(): CloudOrderMap {
    if (typeof window === "undefined") return {}
    try {
        const raw = window.localStorage.getItem(CLOUD_PENDING_STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}
        return Object.fromEntries(Object.entries(parsed).map(([id, value]) => [
            id,
            Array.isArray(value)
                ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
                : [],
        ]))
    } catch {
        return {}
    }
}

function writePendingMap(map: CloudOrderMap): void {
    try {
        window.localStorage.setItem(
            CLOUD_PENDING_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(Object.entries(map).slice(-MAX_PLAYLISTS))),
        )
    } catch {
        // 存储不可用时按云端顺序展示
    }
}

function normalizeCloudTrackOrder(
    playlistId: string,
    cloudTracks: Track[],
): Track[] {
    if (typeof window === "undefined") {
        return cloudTracks
    }

    const orderMap = readCloudOrderMap()
    const pendingMap = readPendingMap()
    const previousOrder = orderMap[playlistId] ?? []
    if (previousOrder.length === 0) {
        orderMap[playlistId] = cloudTracks.map((track) => track.id)
        writeCloudOrderMap(orderMap)
        return cloudTracks
    }

    const currentIds = new Set(cloudTracks.map((track) => track.id))
    const pending = (pendingMap[playlistId] ?? []).filter((id) => currentIds.has(id))
    const pendingIds = new Set(pending)
    const newlyAdded = cloudTracks.filter((track) => pendingIds.has(track.id))
    const existing = cloudTracks.filter((track) => !pendingIds.has(track.id))
    const normalized = [...newlyAdded, ...existing]
    orderMap[playlistId] = normalized.map((track) => track.id)
    pendingMap[playlistId] = []
    writeCloudOrderMap(orderMap)
    writePendingMap(pendingMap)
    return normalized
}

function recordCloudPlaylistAddition(
    playlistId: string,
    existingTrackIds: string[],
    addedTrackIds: string[],
): void {
    if (typeof window === "undefined") {
        return
    }
    const orderMap = readCloudOrderMap()
    const baseline = existingTrackIds.length > 0 ? existingTrackIds : orderMap[playlistId] ?? []
    const known = new Set(baseline)
    const trulyAdded = [...new Set(addedTrackIds)].filter((id) => !known.has(id))
    orderMap[playlistId] = [...new Set(baseline)].slice(0, MAX_TRACK_IDS)
    const pendingMap = readPendingMap()
    pendingMap[playlistId] = [...new Set([
        ...(pendingMap[playlistId] ?? []),
        ...trulyAdded,
    ])].slice(0, MAX_TRACK_IDS)
    writeCloudOrderMap(orderMap)
    writePendingMap(pendingMap)
}

export {
    normalizeCloudTrackOrder,
    recordCloudPlaylistAddition,
}
