/** 自定义曲目顺序：本地专辑 / 全部 / 网易云歌单 */

const LOCAL_ORDER_KEY = "musicstorm.local.track-order"
const PLAYLIST_ORDER_KEY = "musicstorm.playlist.track-order"
const ORDER_EVENT = "musicstorm-track-order"

type LocalTrackOrder = {
    all: string[]
    byAlbum: Record<string, string[]>
}

type PlaylistOrderMap = Record<string, string[]>

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") {
        return fallback
    }
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
            return fallback
        }
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function emitOrder(): void {
    window.dispatchEvent(new Event(ORDER_EVENT))
}

function getLocalTrackOrder(): LocalTrackOrder {
    const data = readJson<Partial<LocalTrackOrder>>(LOCAL_ORDER_KEY, {})
    return {
        all: Array.isArray(data.all) ? data.all.filter((id) => typeof id === "string") : [],
        byAlbum:
            data.byAlbum && typeof data.byAlbum === "object"
                ? Object.fromEntries(
                      Object.entries(data.byAlbum).map(([k, v]) => [
                          k,
                          Array.isArray(v) ? v.filter((id) => typeof id === "string") : [],
                      ]),
                  )
                : {},
    }
}

function setLocalAllOrder(ids: string[]): void {
    const next = { ...getLocalTrackOrder(), all: ids }
    window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(next))
    emitOrder()
}

function setLocalAlbumOrder(albumId: string, ids: string[]): void {
    const prev = getLocalTrackOrder()
    const next: LocalTrackOrder = {
        ...prev,
        byAlbum: { ...prev.byAlbum, [albumId]: ids },
    }
    window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(next))
    emitOrder()
}

function getLocalOrderIds(scope: "all" | string): string[] {
    const order = getLocalTrackOrder()
    if (scope === "all") {
        return order.all
    }
    return order.byAlbum[scope] ?? []
}

function getPlaylistTrackOrder(playlistId: string): string[] {
    const map = readJson<PlaylistOrderMap>(PLAYLIST_ORDER_KEY, {})
    const list = map[playlistId]
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : []
}

function setPlaylistTrackOrder(playlistId: string, ids: string[]): void {
    const map = readJson<PlaylistOrderMap>(PLAYLIST_ORDER_KEY, {})
    map[playlistId] = ids
    window.localStorage.setItem(PLAYLIST_ORDER_KEY, JSON.stringify(map))
    emitOrder()
}

/** 按 order 重排；order 中没有的 id 保持相对顺序接在末尾 */
function applyIdOrder<T extends { id: string }>(
    items: readonly T[],
    order: readonly string[],
): T[] {
    if (order.length === 0 || items.length <= 1) {
        return items.slice()
    }
    const byId = new Map(items.map((item) => [item.id, item]))
    const used = new Set<string>()
    const out: T[] = []
    for (const id of order) {
        const hit = byId.get(id)
        if (hit) {
            out.push(hit)
            used.add(id)
        }
    }
    for (const item of items) {
        if (!used.has(item.id)) {
            out.push(item)
        }
    }
    return out
}

export {
    ORDER_EVENT,
    applyIdOrder,
    getLocalOrderIds,
    getLocalTrackOrder,
    getPlaylistTrackOrder,
    setLocalAlbumOrder,
    setLocalAllOrder,
    setPlaylistTrackOrder,
}