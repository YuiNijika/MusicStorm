/** 歌单资料库 / 歌单歌曲列表 */

import {
    isCollectionSortKey,
    isTrackSortKey,
    type CollectionSortKey,
    type TrackSortKey,
} from "@/lib/library/sort"

const STORAGE_KEY = "musicstorm-library-layout"
const LAYOUT_EVENT = "musicstorm-library-layout"

type ViewMode = "card" | "list"

type LibraryLayoutPrefs = {
    /** 资料库歌单网格 */
    playlistView: ViewMode
    /** 歌单内页歌曲 */
    playlistTracksView: ViewMode
    /** 专辑内页歌曲 */
    albumTracksView: ViewMode
    /** 歌单内 / 本地 / 专辑曲目排序 */
    trackSort: TrackSortKey
    /** 网易云「我的歌单」列表排序 */
    playlistSort: CollectionSortKey
    /** 本地专辑列表排序 */
    localAlbumSort: CollectionSortKey
}

const DEFAULT_LAYOUT: LibraryLayoutPrefs = {
    playlistView: "card",
    playlistTracksView: "list",
    albumTracksView: "list",
    trackSort: "default",
    playlistSort: "default",
    localAlbumSort: "default",
}

function isViewMode(value: unknown): value is ViewMode {
    return value === "card" || value === "list"
}

function readLibraryLayout(): LibraryLayoutPrefs {
    if (typeof window === "undefined") {
        return { ...DEFAULT_LAYOUT }
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return { ...DEFAULT_LAYOUT }
        }
        const data = JSON.parse(raw) as Partial<LibraryLayoutPrefs>
        return {
            playlistView: isViewMode(data.playlistView)
                ? data.playlistView
                : DEFAULT_LAYOUT.playlistView,
            playlistTracksView: isViewMode(data.playlistTracksView)
                ? data.playlistTracksView
                : DEFAULT_LAYOUT.playlistTracksView,
            albumTracksView: isViewMode(data.albumTracksView)
                ? data.albumTracksView
                : DEFAULT_LAYOUT.albumTracksView,
            trackSort: isTrackSortKey(data.trackSort)
                ? data.trackSort
                : DEFAULT_LAYOUT.trackSort,
            playlistSort: isCollectionSortKey(data.playlistSort)
                ? data.playlistSort
                : DEFAULT_LAYOUT.playlistSort,
            localAlbumSort: isCollectionSortKey(data.localAlbumSort)
                ? data.localAlbumSort
                : DEFAULT_LAYOUT.localAlbumSort,
        }
    } catch {
        return { ...DEFAULT_LAYOUT }
    }
}

function writeLibraryLayout(prefs: LibraryLayoutPrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    window.dispatchEvent(new Event(LAYOUT_EVENT))
}

function patchLibraryLayout(patch: Partial<LibraryLayoutPrefs>): LibraryLayoutPrefs {
    const next = { ...readLibraryLayout(), ...patch }
    writeLibraryLayout(next)
    return next
}

function setPlaylistView(mode: ViewMode): void {
    patchLibraryLayout({ playlistView: mode })
}

function setPlaylistTracksView(mode: ViewMode): void {
    patchLibraryLayout({ playlistTracksView: mode })
}

function setAlbumTracksView(mode: ViewMode): void {
    patchLibraryLayout({ albumTracksView: mode })
}

function setTrackSort(key: TrackSortKey): void {
    patchLibraryLayout({ trackSort: key })
}

function setPlaylistSort(key: CollectionSortKey): void {
    patchLibraryLayout({ playlistSort: key })
}

function setLocalAlbumSort(key: CollectionSortKey): void {
    patchLibraryLayout({ localAlbumSort: key })
}

export {
    DEFAULT_LAYOUT,
    LAYOUT_EVENT,
    readLibraryLayout,
    setAlbumTracksView,
    setLocalAlbumSort,
    setPlaylistSort,
    setPlaylistTracksView,
    setPlaylistView,
    setTrackSort,
}
export type { LibraryLayoutPrefs, ViewMode }