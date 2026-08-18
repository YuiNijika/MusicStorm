
import { applyIdOrder } from "@/lib/library/track-order"

type TrackSortKey =
    | "default"
    | "title"
    | "artist"
    | "album"
    | "duration"
    | "custom"

type CollectionSortKey = "default" | "custom" | "title" | "count" | "updated"
type RadioSortKey = "default" | "custom" | "title" | "count"
type ProgramSortKey = "latest" | "earliest" | "custom"

const TRACK_SORT_OPTIONS: Array<{ value: TrackSortKey; label: string }> = [
    { value: "default", label: "默认" },
    { value: "custom", label: "自定义" },
    { value: "title", label: "歌名" },
    { value: "artist", label: "艺人" },
    { value: "album", label: "专辑" },
    { value: "duration", label: "时长" },
]

const PLAYLIST_SORT_OPTIONS: Array<{ value: CollectionSortKey; label: string }> = [
    { value: "default", label: "默认" },
    { value: "custom", label: "自定义" },
    { value: "title", label: "名称" },
    { value: "count", label: "曲目数" },
]

const RADIO_SORT_OPTIONS: Array<{
    value: RadioSortKey
    label: string
}> = [
    { value: "default", label: "默认" },
    { value: "custom", label: "自定义" },
    { value: "title", label: "名称" },
    { value: "count", label: "节目数" },
]

const PROGRAM_SORT_OPTIONS: Array<{
    value: ProgramSortKey
    label: string
}> = [
    { value: "latest", label: "最新" },
    { value: "earliest", label: "最早" },
    { value: "custom", label: "自定义" },
]

const LOCAL_ALBUM_SORT_OPTIONS: Array<{
    value: CollectionSortKey
    label: string
}> = [
    { value: "default", label: "默认" },
    { value: "custom", label: "自定义" },
    { value: "title", label: "名称" },
    { value: "count", label: "曲目数" },
    { value: "updated", label: "最近更新" },
]

type SortableTrack = {
    id: string
    title: string
    artist: string
    album: string
    durationMs: number
}

type SortablePlaylist = {
    title: string
    trackCount?: number
    trackIds?: string[]
}

type SortableRadio = {
    title: string
    programCount?: number
}

type SortableProgram = {
    id: string
    createTime?: number
}

type SortableLocalAlbum = {
    title: string
    updatedAt: number
    createdAt: number
}

function collatorCompare(a: string, b: string): number {
    return a.localeCompare(b, "zh-CN", { sensitivity: "base", numeric: true })
}

function isTrackSortKey(value: unknown): value is TrackSortKey {
    return (
        value === "default" ||
        value === "custom" ||
        value === "title" ||
        value === "artist" ||
        value === "album" ||
        value === "duration"
    )
}

function isRadioSortKey(value: unknown): value is RadioSortKey {
    return (
        value === "default" ||
        value === "custom" ||
        value === "title" ||
        value === "count"
    )
}

function isProgramSortKey(value: unknown): value is ProgramSortKey {
    return value === "latest" || value === "earliest" || value === "custom"
}

function isCollectionSortKey(value: unknown): value is CollectionSortKey {
    return (
        value === "default" ||
        value === "custom" ||
        value === "title" ||
        value === "count" ||
        value === "updated"
    )
}

// 稳定排序：default 原样，custom 按 order，其余按字段
function sortTracks<T extends SortableTrack>(
    tracks: readonly T[],
    key: TrackSortKey,
    customOrder?: readonly string[],
): T[] {
    if (tracks.length <= 1) {
        return tracks.slice()
    }
    if (key === "custom") {
        return applyIdOrder(tracks, customOrder ?? [])
    }
    if (key === "default") {
        return tracks.slice()
    }
    const indexed = tracks.map((item, index) => ({ item, index }))
    indexed.sort((a, b) => {
        let cmp = 0
        if (key === "title") {
            cmp = collatorCompare(a.item.title, b.item.title)
        } else if (key === "artist") {
            cmp = collatorCompare(a.item.artist, b.item.artist)
            if (cmp === 0) {
                cmp = collatorCompare(a.item.title, b.item.title)
            }
        } else if (key === "album") {
            cmp = collatorCompare(a.item.album, b.item.album)
            if (cmp === 0) {
                cmp = collatorCompare(a.item.title, b.item.title)
            }
        } else if (key === "duration") {
            cmp = a.item.durationMs - b.item.durationMs
        }
        return cmp !== 0 ? cmp : a.index - b.index
    })
    return indexed.map((row) => row.item)
}

function playlistCount(item: SortablePlaylist): number {
    if (typeof item.trackCount === "number") {
        return item.trackCount
    }
    return item.trackIds?.length ?? 0
}

function sortPlaylists<T extends SortablePlaylist & { id: string }>(
    items: readonly T[],
    key: CollectionSortKey,
    customOrder?: readonly string[],
): T[] {
    if (key === "custom") {
        return applyIdOrder(items, customOrder ?? [])
    }
    if (key === "default" || key === "updated" || items.length <= 1) {
        return items.slice()
    }
    const indexed = items.map((item, index) => ({ item, index }))
    indexed.sort((a, b) => {
        let cmp = 0
        if (key === "title") {
            cmp = collatorCompare(a.item.title, b.item.title)
        } else if (key === "count") {
            cmp = playlistCount(b.item) - playlistCount(a.item)
        }
        return cmp !== 0 ? cmp : a.index - b.index
    })
    return indexed.map((row) => row.item)
}

function sortRadios<T extends SortableRadio & { id: string }>(
    items: readonly T[],
    key: RadioSortKey,
    customOrder?: readonly string[],
): T[] {
    if (key === "custom") {
        return applyIdOrder(items, customOrder ?? [])
    }
    if (key === "default" || items.length <= 1) {
        return items.slice()
    }
    const indexed = items.map((item, index) => ({ item, index }))
    indexed.sort((a, b) => {
        const cmp =
            key === "title"
                ? collatorCompare(a.item.title, b.item.title)
                : (b.item.programCount ?? 0) - (a.item.programCount ?? 0)
        return cmp !== 0 ? cmp : a.index - b.index
    })
    return indexed.map((row) => row.item)
}

function sortPrograms<T extends SortableProgram>(
    items: readonly T[],
    key: ProgramSortKey,
    customOrder?: readonly string[],
): T[] {
    if (key === "custom") {
        return applyIdOrder(items, customOrder ?? [])
    }
    if (items.length <= 1) {
        return items.slice()
    }
    const indexed = items.map((item, index) => ({ item, index }))
    indexed.sort((a, b) => {
        const aTime = a.item.createTime
        const bTime = b.item.createTime
        if (aTime == null && bTime != null) return 1
        if (aTime != null && bTime == null) return -1
        const cmp = (aTime ?? 0) - (bTime ?? 0)
        const directed = key === "earliest" ? cmp : -cmp
        return directed !== 0 ? directed : a.index - b.index
    })
    return indexed.map((row) => row.item)
}

function sortLocalAlbums<T extends SortableLocalAlbum & { id: string }>(
    items: readonly T[],
    key: CollectionSortKey,
    countOf: (item: T) => number,
    customOrder?: readonly string[],
): T[] {
    if (key === "custom") {
        return applyIdOrder(items, customOrder ?? [])
    }
    if (key === "default" || items.length <= 1) {
        return items.slice()
    }
    const indexed = items.map((item, index) => ({ item, index }))
    indexed.sort((a, b) => {
        let cmp = 0
        if (key === "title") {
            cmp = collatorCompare(a.item.title, b.item.title)
        } else if (key === "count") {
            cmp = countOf(b.item) - countOf(a.item)
        } else if (key === "updated") {
            cmp = b.item.updatedAt - a.item.updatedAt
        }
        return cmp !== 0 ? cmp : a.index - b.index
    })
    return indexed.map((row) => row.item)
}

export {
    LOCAL_ALBUM_SORT_OPTIONS,
    PLAYLIST_SORT_OPTIONS,
    PROGRAM_SORT_OPTIONS,
    RADIO_SORT_OPTIONS,
    TRACK_SORT_OPTIONS,
    isCollectionSortKey,
    isProgramSortKey,
    isRadioSortKey,
    isTrackSortKey,
    sortLocalAlbums,
    sortPlaylists,
    sortPrograms,
    sortRadios,
    sortTracks,
}
export type {
    CollectionSortKey,
    ProgramSortKey,
    RadioSortKey,
    TrackSortKey,
}