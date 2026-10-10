import type { Track } from "@/lib/types"

const CLOUD_ORDER_STORAGE_KEY = "musicstorm.playlist.cloud-order"

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
                result[playlistId] = value.filter(
                    (id): id is string => typeof id === "string",
                )
            }
        }
        return result
    } catch {
        return {}
    }
}

function writeCloudOrderMap(map: CloudOrderMap): void {
    try {
        window.localStorage.setItem(
            CLOUD_ORDER_STORAGE_KEY,
            JSON.stringify(map),
        )
    } catch {
        // 存储不可用时仍按云端返回顺序展示
    }
}

function normalizeCloudTrackOrder(
    playlistId: string,
    cloudTracks: Track[],
): Track[] {
    if (cloudTracks.length <= 1 || typeof window === "undefined") {
        return cloudTracks
    }

    const orderMap = readCloudOrderMap()
    const previousOrder = orderMap[playlistId] ?? []
    if (previousOrder.length === 0) {
        orderMap[playlistId] = cloudTracks.map((track) => track.id)
        writeCloudOrderMap(orderMap)
        return cloudTracks
    }

    const previousIds = new Set(previousOrder)
    const newlyAdded = cloudTracks.filter((track) => !previousIds.has(track.id))
    const existing = cloudTracks.filter((track) => previousIds.has(track.id))
    const normalized = [...newlyAdded, ...existing]
    orderMap[playlistId] = normalized.map((track) => track.id)
    writeCloudOrderMap(orderMap)
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
    const previous = orderMap[playlistId] ?? []
    const baseline = existingTrackIds.length > 0 ? existingTrackIds : previous
    const existing = baseline.filter((id) => !addedTrackIds.includes(id))
    orderMap[playlistId] = [...new Set([...addedTrackIds, ...existing])]
    writeCloudOrderMap(orderMap)
}

export {
    normalizeCloudTrackOrder,
    recordCloudPlaylistAddition,
}
