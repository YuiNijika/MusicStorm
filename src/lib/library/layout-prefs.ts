/** 歌单资料库 / 歌单歌曲列表：卡片 or 列表 */

const STORAGE_KEY = "musicstorm-library-layout"
const LAYOUT_EVENT = "musicstorm-library-layout"

type ViewMode = "card" | "list"

type LibraryLayoutPrefs = {
    /** 资料库歌单网格 */
    playlistView: ViewMode
    /** 歌单内页歌曲 */
    playlistTracksView: ViewMode
}

const DEFAULT_LAYOUT: LibraryLayoutPrefs = {
    playlistView: "card",
    playlistTracksView: "list",
}

function isViewMode(value: unknown): value is ViewMode {
    return value === "card" || value === "list"
}

function readLibraryLayout(): LibraryLayoutPrefs {
    if (typeof window === "undefined") {
        return DEFAULT_LAYOUT
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return DEFAULT_LAYOUT
        }
        const data = JSON.parse(raw) as Partial<LibraryLayoutPrefs>
        return {
            playlistView: isViewMode(data.playlistView)
                ? data.playlistView
                : DEFAULT_LAYOUT.playlistView,
            playlistTracksView: isViewMode(data.playlistTracksView)
                ? data.playlistTracksView
                : DEFAULT_LAYOUT.playlistTracksView,
        }
    } catch {
        return DEFAULT_LAYOUT
    }
}

function writeLibraryLayout(prefs: LibraryLayoutPrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    window.dispatchEvent(new Event(LAYOUT_EVENT))
}

function setPlaylistView(mode: ViewMode): void {
    const next = { ...readLibraryLayout(), playlistView: mode }
    writeLibraryLayout(next)
}

function setPlaylistTracksView(mode: ViewMode): void {
    const next = { ...readLibraryLayout(), playlistTracksView: mode }
    writeLibraryLayout(next)
}

export {
    DEFAULT_LAYOUT,
    LAYOUT_EVENT,
    readLibraryLayout,
    setPlaylistTracksView,
    setPlaylistView,
}
export type { LibraryLayoutPrefs, ViewMode }