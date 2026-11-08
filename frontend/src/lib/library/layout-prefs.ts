
import {
    isCollectionSortKey,
    isProgramSortKey,
    isRadioSortKey,
    isTrackSortKey,
    type CollectionSortKey,
    type ProgramSortKey,
    type RadioSortKey,
    type TrackSortKey,
} from "@/lib/library/sort"

const STORAGE_KEY = "musicstorm-library-layout"
const LAYOUT_EVENT = "musicstorm-library-layout"

type ViewMode = "card" | "list"

type LibraryLayoutPrefs = {
    /** 资料库歌单网格 */
    playlistView: ViewMode
    /** 本地专辑资料库 */
    localAlbumView: ViewMode
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
    /** 电台订阅与发现展示 */
    radioView: ViewMode
    /** 电台订阅与发现排序 */
    radioSort: RadioSortKey
    /** 单个电台节目展示 */
    programView: ViewMode
    /** 单个电台节目排序 */
    programSort: ProgramSortKey
}

const DEFAULT_LAYOUT: LibraryLayoutPrefs = {
    playlistView: "card",
    localAlbumView: "card",
    playlistTracksView: "list",
    albumTracksView: "list",
    trackSort: "default",
    playlistSort: "default",
    localAlbumSort: "default",
    radioView: "card",
    radioSort: "default",
    programView: "list",
    programSort: "latest",
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
            localAlbumView: isViewMode(data.localAlbumView)
                ? data.localAlbumView
                : DEFAULT_LAYOUT.localAlbumView,
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
            radioView: isViewMode(data.radioView)
                ? data.radioView
                : DEFAULT_LAYOUT.radioView,
            radioSort: isRadioSortKey(data.radioSort)
                ? data.radioSort
                : DEFAULT_LAYOUT.radioSort,
            programView: isViewMode(data.programView)
                ? data.programView
                : DEFAULT_LAYOUT.programView,
            programSort: isProgramSortKey(data.programSort)
                ? data.programSort
                : DEFAULT_LAYOUT.programSort,
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

function setLocalAlbumView(mode: ViewMode): void {
    patchLibraryLayout({ localAlbumView: mode })
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

function setRadioView(mode: ViewMode): void {
    patchLibraryLayout({ radioView: mode })
}

function setRadioSort(key: RadioSortKey): void {
    patchLibraryLayout({ radioSort: key })
}

function setProgramView(mode: ViewMode): void {
    patchLibraryLayout({ programView: mode })
}

function setProgramSort(key: ProgramSortKey): void {
    patchLibraryLayout({ programSort: key })
}

function setLocalAlbumSort(key: CollectionSortKey): void {
    patchLibraryLayout({ localAlbumSort: key })
}

export {
    DEFAULT_LAYOUT,
    LAYOUT_EVENT,
    readLibraryLayout,
    setAlbumTracksView,
    setLocalAlbumView,
    setLocalAlbumSort,
    setPlaylistSort,
    setPlaylistTracksView,
    setPlaylistView,
    setProgramSort,
    setProgramView,
    setRadioSort,
    setRadioView,
    setTrackSort,
}
export type { LibraryLayoutPrefs, ViewMode }