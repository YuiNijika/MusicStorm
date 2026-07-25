import { convertFileSrc } from "@tauri-apps/api/core"

import type { Track } from "@/lib/types"

const STORAGE_KEY = "musicstorm.local.library"

export type LocalAlbum = {
    id: string
    title: string
    artist: string
    /** data:image/...;base64,... 存入 localStorage + SQLite */
    coverDataUrl: string
    folderPath: string | null
    createdAt: number
    updatedAt: number
}

export type StoredLocalTrack = {
    id: string
    title: string
    artist: string
    album: string
    path: string
    durationMs: number
    folderPath: string
    albumId: string | null
    /** 内嵌封面落盘绝对路径 */
    coverPath: string | null
    /** 内嵌 / sidecar 歌词全文 */
    lyricText: string | null
    /** sidecar .lrc 路径 */
    lrcPath: string | null
}

export type LocalLibraryState = {
    folders: string[]
    albums: LocalAlbum[]
    tracks: StoredLocalTrack[]
}

export type AlbumDraft = {
    title: string
    artist: string
    coverDataUrl: string
    folderPath: string | null
}

type ScanTrackDto = {
    id: string
    title: string
    artist: string
    album: string
    path: string
    durationMs: number
    coverPath?: string | null
    lyricText?: string | null
    lrcPath?: string | null
}

function emptyLibrary(): LocalLibraryState {
    return { folders: [], albums: [], tracks: [] }
}

function nowMs(): number {
    return Date.now()
}

/** localStorage 只保留短歌词；长文本走 lrcPath */
function capLyricText(text: string | null | undefined): string | null {
    if (!text || typeof text !== "string") {
        return null
    }
    const trimmed = text.trim()
    if (!trimmed) {
        return null
    }
    if (trimmed.length > 4 * 1024) {
        return null
    }
    return trimmed
}

function newAlbumId(): string {
    return `album:${nowMs().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

function folderDisplayName(folderPath: string): string {
    const parts = folderPath.replace(/\\/g, "/").split("/").filter(Boolean)
    return parts[parts.length - 1] ?? folderPath
}

/** 从扫描结果多数表决专辑名 / 艺人 */
function majorityLabel(values: Array<string | undefined>, skip: string[]): string {
    const skipSet = new Set(skip.map((s) => s.toLowerCase()))
    const counts = new Map<string, number>()
    for (const raw of values) {
        const value = raw?.trim()
        if (!value || skipSet.has(value.toLowerCase())) {
            continue
        }
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    let best = ""
    let bestCount = 0
    for (const [label, count] of counts) {
        if (count > bestCount) {
            best = label
            bestCount = count
        }
    }
    return best
}

function deriveAlbumFieldsFromScan(
    folderPath: string,
    scanned: ScanTrackDto[],
    draft: AlbumDraft,
): { title: string; artist: string; coverDataUrl: string } {
    const fromTagsTitle = majorityLabel(
        scanned.map((item) => item.album),
        ["本地文件", "unknown", "unknown album"],
    )
    const fromTagsArtist = majorityLabel(
        scanned.map((item) => item.artist),
        ["未知艺人", "unknown", "unknown artist", "various artists"],
    )
    const title =
        draft.title.trim() || fromTagsTitle || folderDisplayName(folderPath)
    const artist = draft.artist.trim() || fromTagsArtist
    // 手动封面优先；否则空，UI 用曲目内嵌封面兜底
    const coverDataUrl = draft.coverDataUrl.trim()
    return { title, artist, coverDataUrl }
}

/** 本地路径 → 可展示/可播放的 asset URL；data/http 原样返回 */
function toAssetUrl(path: string | null | undefined): string {
    if (!path) {
        return ""
    }
    if (
        path.startsWith("data:") ||
        path.startsWith("http://") ||
        path.startsWith("https://") ||
        path.startsWith("asset:") ||
        path.startsWith("blob:")
    ) {
        return path
    }
    try {
        // Windows 路径保持原样交给 convertFileSrc；去掉 file:// 前缀
        const normalized = path.replace(/^file:\/\//i, "").replace(/^\/([A-Za-z]:)/, "$1")
        return convertFileSrc(normalized)
    } catch {
        return ""
    }
}

function normalizeAlbum(raw: Partial<LocalAlbum>): LocalAlbum | null {
    if (!raw || typeof raw.id !== "string" || !raw.id) {
        return null
    }
    return {
        id: raw.id,
        title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "未命名专辑",
        artist: typeof raw.artist === "string" ? raw.artist.trim() : "",
        coverDataUrl: typeof raw.coverDataUrl === "string" ? raw.coverDataUrl : "",
        folderPath:
            typeof raw.folderPath === "string" && raw.folderPath.trim()
                ? raw.folderPath
                : null,
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : nowMs(),
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : nowMs(),
    }
}

function normalizeTrack(raw: Partial<StoredLocalTrack>): StoredLocalTrack | null {
    if (!raw || typeof raw.id !== "string" || typeof raw.path !== "string") {
        return null
    }
    return {
        id: raw.id,
        title: typeof raw.title === "string" ? raw.title : "未知曲目",
        artist: typeof raw.artist === "string" ? raw.artist : "未知艺人",
        album: typeof raw.album === "string" ? raw.album : "本地文件",
        path: raw.path,
        durationMs: typeof raw.durationMs === "number" ? raw.durationMs : 0,
        folderPath: typeof raw.folderPath === "string" ? raw.folderPath : "",
        albumId: typeof raw.albumId === "string" ? raw.albumId : null,
        coverPath: typeof raw.coverPath === "string" && raw.coverPath ? raw.coverPath : null,
        lyricText: typeof raw.lyricText === "string" && raw.lyricText ? raw.lyricText : null,
        lrcPath: typeof raw.lrcPath === "string" && raw.lrcPath ? raw.lrcPath : null,
    }
}

function loadLocalLibrary(): LocalLibraryState {
    if (typeof window === "undefined") {
        return emptyLibrary()
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return emptyLibrary()
        }
        const parsed = JSON.parse(raw) as Partial<LocalLibraryState>
        const folders = Array.isArray(parsed.folders)
            ? parsed.folders.filter((f) => typeof f === "string")
            : []
        const albums = Array.isArray(parsed.albums)
            ? parsed.albums.map(normalizeAlbum).filter((item): item is LocalAlbum => item != null)
            : []
        const tracks = Array.isArray(parsed.tracks)
            ? parsed.tracks
                  .map(normalizeTrack)
                  .filter((item): item is StoredLocalTrack => item != null)
            : []

        if (albums.length === 0 && folders.length > 0) {
            const migrated = migrateFoldersToAlbums({ folders, albums: [], tracks })
            saveLocalLibrary(migrated)
            return migrated
        }

        return { folders, albums, tracks }
    } catch {
        return emptyLibrary()
    }
}

function migrateFoldersToAlbums(state: LocalLibraryState): LocalLibraryState {
    const albums: LocalAlbum[] = state.folders.map((folderPath) => {
        const ts = nowMs()
        return {
            id: newAlbumId(),
            title: folderDisplayName(folderPath),
            artist: "",
            coverDataUrl: "",
            folderPath,
            createdAt: ts,
            updatedAt: ts,
        }
    })
    const albumByFolder = new Map(albums.map((album) => [album.folderPath ?? "", album]))
    const tracks = state.tracks.map((track) => {
        const album = albumByFolder.get(track.folderPath)
        if (!album) {
            return track
        }
        return {
            ...track,
            albumId: album.id,
            album: album.title,
        }
    })
    return { folders: state.folders, albums, tracks }
}

function saveLocalLibrary(state: LocalLibraryState): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function createEmptyAlbum(draft: AlbumDraft): { state: LocalLibraryState; album: LocalAlbum } {
    const prev = loadLocalLibrary()
    const ts = nowMs()
    const album: LocalAlbum = {
        id: newAlbumId(),
        title: draft.title.trim() || "未命名专辑",
        artist: draft.artist.trim(),
        coverDataUrl: draft.coverDataUrl,
        folderPath: draft.folderPath,
        createdAt: ts,
        updatedAt: ts,
    }

    let folders = prev.folders
    if (album.folderPath && !folders.includes(album.folderPath)) {
        folders = [...folders, album.folderPath]
    }

    const state: LocalLibraryState = {
        folders,
        albums: [album, ...prev.albums],
        tracks: prev.tracks,
    }
    saveLocalLibrary(state)
    return { state, album }
}

function updateAlbum(
    state: LocalLibraryState,
    albumId: string,
    patch: Partial<Pick<LocalAlbum, "title" | "artist" | "coverDataUrl" | "folderPath">>,
): LocalLibraryState {
    const ts = nowMs()
    const albums = state.albums.map((album) => {
        if (album.id !== albumId) {
            return album
        }
        return {
            ...album,
            title: patch.title !== undefined ? patch.title.trim() || album.title : album.title,
            artist: patch.artist !== undefined ? patch.artist.trim() : album.artist,
            coverDataUrl:
                patch.coverDataUrl !== undefined ? patch.coverDataUrl : album.coverDataUrl,
            folderPath: patch.folderPath !== undefined ? patch.folderPath : album.folderPath,
            updatedAt: ts,
        }
    })

    const album = albums.find((item) => item.id === albumId)
    const tracks = state.tracks.map((track) => {
        if (track.albumId !== albumId || !album) {
            return track
        }
        return {
            ...track,
            album: album.title,
            artist: track.artist === "未知艺人" && album.artist ? album.artist : track.artist,
        }
    })

    let folders = state.folders
    if (album?.folderPath && !folders.includes(album.folderPath)) {
        folders = [...folders, album.folderPath]
    }

    const next = { folders, albums, tracks }
    saveLocalLibrary(next)
    return next
}

function mergeFolderScan(
    state: LocalLibraryState,
    folderPath: string,
    scanned: ScanTrackDto[],
    draft: AlbumDraft,
    existingAlbumId?: string | null,
): LocalLibraryState {
    const ts = nowMs()
    const derived = deriveAlbumFieldsFromScan(folderPath, scanned, draft)
    const folders = state.folders.includes(folderPath)
        ? state.folders
        : [...state.folders, folderPath]

    let albumId = existingAlbumId ?? null
    let albums = [...state.albums]

    if (albumId) {
        albums = albums.map((album) =>
            album.id === albumId
                ? {
                      ...album,
                      title: derived.title || album.title,
                      // 空字符串表示沿用标签推导或清空用户未填
                      artist: draft.artist.trim()
                          ? draft.artist.trim()
                          : derived.artist || album.artist,
                      coverDataUrl: draft.coverDataUrl
                          ? draft.coverDataUrl
                          : album.coverDataUrl.startsWith("data:")
                            ? album.coverDataUrl
                            : derived.coverDataUrl,
                      folderPath,
                      updatedAt: ts,
                  }
                : album,
        )
    } else {
        const found = albums.find((album) => album.folderPath === folderPath)
        if (found) {
            albumId = found.id
            albums = albums.map((album) =>
                album.id === found.id
                    ? {
                          ...album,
                          title: derived.title || album.title,
                          artist: draft.artist.trim()
                              ? draft.artist.trim()
                              : derived.artist || album.artist,
                          coverDataUrl: draft.coverDataUrl
                              ? draft.coverDataUrl
                              : album.coverDataUrl.startsWith("data:")
                                ? album.coverDataUrl
                                : derived.coverDataUrl,
                          folderPath,
                          updatedAt: ts,
                      }
                    : album,
            )
        } else {
            albumId = newAlbumId()
            albums = [
                {
                    id: albumId,
                    title: derived.title,
                    artist: derived.artist,
                    coverDataUrl: derived.coverDataUrl,
                    folderPath,
                    createdAt: ts,
                    updatedAt: ts,
                },
                ...albums,
            ]
        }
    }

    const album = albums.find((item) => item.id === albumId)!
    const retained = state.tracks.filter((track) => track.folderPath !== folderPath)
    const nextFromFolder: StoredLocalTrack[] = scanned.map((item) => ({
        id: item.id,
        title: item.title,
        artist:
            item.artist && item.artist !== "未知艺人"
                ? item.artist
                : album.artist || item.artist || "未知艺人",
        // 有内嵌专辑名时保留；否则用专辑名
        album: item.album && item.album !== "本地文件" ? item.album : album.title,
        path: item.path,
        durationMs: item.durationMs ?? 0,
        folderPath,
        albumId: album.id,
        coverPath: item.coverPath ?? null,
        // 大段歌词不进 localStorage，靠 lrcPath 读文件
        lyricText: capLyricText(item.lyricText),
        lrcPath: item.lrcPath ?? null,
    }))

    const byId = new Map<string, StoredLocalTrack>()
    for (const track of retained) {
        byId.set(track.id, track)
    }
    for (const track of nextFromFolder) {
        byId.set(track.id, track)
    }

    const tracks = Array.from(byId.values()).sort((a, b) =>
        a.title.localeCompare(b.title, "zh-CN"),
    )

    const next = { folders, albums, tracks }
    saveLocalLibrary(next)
    return next
}

function clearLocalLibrary(): LocalLibraryState {
    const next = emptyLibrary()
    saveLocalLibrary(next)
    return next
}

function removeFolder(state: LocalLibraryState, folderPath: string): LocalLibraryState {
    const next: LocalLibraryState = {
        folders: state.folders.filter((item) => item !== folderPath),
        albums: state.albums.filter((album) => album.folderPath !== folderPath),
        tracks: state.tracks.filter((track) => track.folderPath !== folderPath),
    }
    saveLocalLibrary(next)
    return next
}

function removeAlbum(state: LocalLibraryState, albumId: string): LocalLibraryState {
    const album = state.albums.find((item) => item.id === albumId)
    const next: LocalLibraryState = {
        folders: album?.folderPath
            ? state.folders.filter((item) => item !== album.folderPath)
            : state.folders,
        albums: state.albums.filter((item) => item.id !== albumId),
        tracks: state.tracks.filter((track) => track.albumId !== albumId),
    }
    saveLocalLibrary(next)
    return next
}

function albumCoverMap(state: LocalLibraryState): Map<string, string> {
    const map = new Map(
        state.albums
            .filter((album) => album.coverDataUrl)
            .map((album) => [album.id, album.coverDataUrl]),
    )
    // 专辑无手动封面时，用曲目内嵌封面兜底
    for (const track of state.tracks) {
        if (!track.albumId || map.has(track.albumId) || !track.coverPath) {
            continue
        }
        const url = toAssetUrl(track.coverPath)
        if (url) {
            map.set(track.albumId, url)
        }
    }
    return map
}

/** 专辑卡片展示用封面：手动 base64 / 导入时写入的 asset / 曲目内嵌 */
function resolveAlbumCoverUrl(album: LocalAlbum, state: LocalLibraryState): string {
    if (album.coverDataUrl) {
        return toAssetUrl(album.coverDataUrl) || album.coverDataUrl
    }
    const track = state.tracks.find((item) => item.albumId === album.id && item.coverPath)
    return toAssetUrl(track?.coverPath)
}

function storedToTrack(
    item: StoredLocalTrack,
    covers: Map<string, string> = new Map(),
): Track {
    const coverFromFile = toAssetUrl(item.coverPath)
    const coverFromAlbum = item.albumId ? covers.get(item.albumId) ?? "" : ""
    return {
        id: item.id,
        title: item.title,
        artist: item.artist,
        album: item.album,
        // 内嵌曲目封面优先，专辑手动封面兜底
        coverUrl: coverFromFile || coverFromAlbum,
        durationMs: item.durationMs,
        source: "local",
        filePath: item.path,
        lyricText: item.lyricText ?? undefined,
        lrcPath: item.lrcPath ?? undefined,
    }
}

function listLocalPlayableTracks(state: LocalLibraryState = loadLocalLibrary()): Track[] {
    const covers = albumCoverMap(state)
    return state.tracks.map((item) => storedToTrack(item, covers))
}

function listTracksByAlbum(state: LocalLibraryState, albumId: string): Track[] {
    const covers = albumCoverMap(state)
    return state.tracks
        .filter((track) => track.albumId === albumId)
        .map((item) => storedToTrack(item, covers))
}

export {
    STORAGE_KEY,
    clearLocalLibrary,
    createEmptyAlbum,
    folderDisplayName,
    listLocalPlayableTracks,
    listTracksByAlbum,
    loadLocalLibrary,
    mergeFolderScan,
    removeAlbum,
    removeFolder,
    resolveAlbumCoverUrl,
    saveLocalLibrary,
    storedToTrack,
    toAssetUrl,
    updateAlbum,
}
export type { ScanTrackDto }