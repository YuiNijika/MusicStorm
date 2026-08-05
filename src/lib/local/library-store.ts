import { convertFileSrc } from "@tauri-apps/api/core"

import { fileStemFromPath, stripExtension } from "@/lib/local/audio-formats"
import type { Track } from "@/lib/types"

const STORAGE_KEY = "musicstorm.local.library"
const LOCAL_LIBRARY_EVENT = "musicstorm:local-library-change"
const CURRENT_METADATA_VERSION = 2

export type LocalArtist = {
    id: string
    /** 艺人 / 合集名，如 Beyond */
    name: string
    /** 艺人文件夹路径；null 表示手动创建的分组 */
    folderPath: string | null
    /** base64 封面 */
    coverDataUrl: string
    createdAt: number
    updatedAt: number
}

export type LocalAlbum = {
    id: string
    title: string
    artist: string
    /** 归属艺人分组 id；null = 独立专辑 */
    artistId: string | null
    /** base64 封面，存入 localStorage 与 SQLite */
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
    /** 内嵌或 sidecar 歌词全文 */
    lyricText: string | null
    /** sidecar lrc 路径 */
    lrcPath: string | null
    /** 无扩展名文件名，统计归类 */
    fileName: string | null
    /** 内容 MD5 */
    contentHash: string | null
    /** 元数据扫描能力版本；低于当前版本时执行一次增量补扫 */
    metadataVersion: number
    /** 兼容旧状态，后续迁移完成后可移除 */
    metadataScanned: boolean
}

export type LocalLibraryState = {
    folders: string[]
    artists: LocalArtist[]
    albums: LocalAlbum[]
    tracks: StoredLocalTrack[]
}

export type AlbumDraft = {
    title: string
    artist: string
    coverDataUrl: string
    folderPath: string | null
    /** 归属艺人分组；null = 独立 */
    artistId?: string | null
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
    fileName?: string | null
    contentHash?: string | null
    metadataVersion?: number
    metadataScanned?: boolean
}

function emptyLibrary(): LocalLibraryState {
    return { folders: [], artists: [], albums: [], tracks: [] }
}

function nowMs(): number {
    return Date.now()
}

/** localStorage 只保留短歌词，长文本走 lrcPath */
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

function newArtistId(): string {
    return `artist:${nowMs().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

function folderDisplayName(folderPath: string): string {
    const parts = folderPath.replace(/\\/g, "/").split("/").filter(Boolean)
    return parts[parts.length - 1] ?? folderPath
}

/** 从扫描结果多数表决专辑名与艺人 */
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
    // 手动封面优先，否则空，UI 用曲目内嵌封面兜底
    const coverDataUrl = draft.coverDataUrl.trim()
    return { title, artist, coverDataUrl }
}

/** 本地路径转可播放 asset URL；data 与 http 原样返回 */
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
        // Windows 路径交给 convertFileSrc，先去掉 file 协议前缀
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
        artistId: typeof raw.artistId === "string" && raw.artistId ? raw.artistId : null,
        coverDataUrl: typeof raw.coverDataUrl === "string" ? raw.coverDataUrl : "",
        folderPath:
            typeof raw.folderPath === "string" && raw.folderPath.trim()
                ? raw.folderPath
                : null,
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : nowMs(),
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : nowMs(),
    }
}

function normalizeArtist(raw: Partial<LocalArtist>): LocalArtist | null {
    if (!raw || typeof raw.id !== "string" || !raw.id) {
        return null
    }
    return {
        id: raw.id,
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "未命名艺人",
        folderPath:
            typeof raw.folderPath === "string" && raw.folderPath.trim()
                ? raw.folderPath
                : null,
        coverDataUrl: typeof raw.coverDataUrl === "string" ? raw.coverDataUrl : "",
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : nowMs(),
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : nowMs(),
    }
}

function normalizeTrack(raw: Partial<StoredLocalTrack>): StoredLocalTrack | null {
    if (!raw || typeof raw.id !== "string" || typeof raw.path !== "string") {
        return null
    }
    const path = raw.path
    // 旧库可能带后缀，统一 strip
    const fileName =
        typeof raw.fileName === "string" && raw.fileName.trim()
            ? stripExtension(raw.fileName.trim())
            : fileStemFromPath(path)
    return {
        id: raw.id,
        title: typeof raw.title === "string" ? raw.title : "未知曲目",
        artist: typeof raw.artist === "string" ? raw.artist : "未知艺人",
        album: typeof raw.album === "string" ? raw.album : "本地文件",
        path,
        durationMs: typeof raw.durationMs === "number" ? raw.durationMs : 0,
        folderPath: typeof raw.folderPath === "string" ? raw.folderPath : "",
        albumId: typeof raw.albumId === "string" ? raw.albumId : null,
        coverPath: typeof raw.coverPath === "string" && raw.coverPath ? raw.coverPath : null,
        lyricText: typeof raw.lyricText === "string" && raw.lyricText ? raw.lyricText : null,
        lrcPath: typeof raw.lrcPath === "string" && raw.lrcPath ? raw.lrcPath : null,
        fileName: fileName || null,
        contentHash:
            typeof raw.contentHash === "string" && raw.contentHash.trim()
                ? raw.contentHash.trim().toLowerCase()
                : null,
        metadataVersion:
            typeof raw.metadataVersion === "number" && raw.metadataVersion >= 0
                ? Math.floor(raw.metadataVersion)
                : 0,
        metadataScanned: raw.metadataScanned === true,
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
        const artists = Array.isArray(parsed.artists)
            ? parsed.artists.map(normalizeArtist).filter((item): item is LocalArtist => item != null)
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
            const migrated = migrateFoldersToAlbums({ folders, artists, albums: [], tracks })
            saveLocalLibrary(migrated)
            return migrated
        }

        return { folders, artists, albums, tracks }
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
            artistId: null,
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
    return {
        folders: state.folders,
        artists: state.artists ?? [],
        albums,
        tracks,
    }
}

function saveLocalLibrary(state: LocalLibraryState): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.dispatchEvent(new Event(LOCAL_LIBRARY_EVENT))
}

function createEmptyAlbum(draft: AlbumDraft): { state: LocalLibraryState; album: LocalAlbum } {
    const prev = loadLocalLibrary()
    const ts = nowMs()
    const artist =
        draft.artistId != null
            ? prev.artists.find((item) => item.id === draft.artistId) ?? null
            : null
    const album: LocalAlbum = {
        id: newAlbumId(),
        title: draft.title.trim() || "未命名专辑",
        artist: artist?.name ?? draft.artist.trim(),
        artistId: draft.artistId ?? null,
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
        artists: prev.artists,
        albums: [album, ...prev.albums],
        tracks: prev.tracks,
    }
    saveLocalLibrary(state)
    return { state, album }
}

function updateAlbum(
    state: LocalLibraryState,
    albumId: string,
    patch: Partial<
        Pick<LocalAlbum, "title" | "artist" | "artistId" | "coverDataUrl" | "folderPath">
    >,
): LocalLibraryState {
    const ts = nowMs()
    const targetArtist =
        patch.artistId != null
            ? state.artists.find((item) => item.id === patch.artistId) ?? null
            : null
    const albums = state.albums.map((album) => {
        if (album.id !== albumId) {
            return album
        }
        const nextArtistId =
            patch.artistId !== undefined ? patch.artistId ?? null : album.artistId
        // 手动填 artist 优先；否则跟随艺人分组名；否则保持原值
        const nextArtist =
            patch.artist !== undefined && patch.artist.trim()
                ? patch.artist.trim()
                : targetArtist
                  ? targetArtist.name
                  : patch.artistId === null
                    ? album.artist
                    : album.artist
        return {
            ...album,
            title: patch.title !== undefined ? patch.title.trim() || album.title : album.title,
            artist: nextArtist,
            artistId: nextArtistId,
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

    const next = { folders, artists: state.artists, albums, tracks }
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

    const artist =
        draft.artistId != null
            ? state.artists.find((item) => item.id === draft.artistId) ?? null
            : null
    // 艺人分组名优先；手动 artist 次之；最后标签推导
    const artistName =
        artist?.name ||
        draft.artist.trim() ||
        derived.artist

    let albumId = existingAlbumId ?? null
    let albums = [...state.albums]

    if (albumId) {
        albums = albums.map((album) =>
            album.id === albumId
                ? {
                      ...album,
                      title: derived.title || album.title,
                      artist: draft.artist.trim()
                          ? draft.artist.trim()
                          : artistName || album.artist,
                      artistId:
                          draft.artistId !== undefined
                              ? draft.artistId ?? null
                              : album.artistId,
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
                              : artistName || album.artist,
                          artistId:
                              draft.artistId !== undefined
                                  ? draft.artistId ?? null
                                  : album.artistId,
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
                    artist: artistName,
                    artistId: draft.artistId ?? null,
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
    const nextFromFolder: StoredLocalTrack[] = scanned.map((item) =>
        scanDtoToStored(item, {
            albumId: album.id,
            albumTitle: album.title,
            albumArtist: album.artist,
            folderPath,
        }),
    )

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

    const next = { folders, artists: state.artists, albums, tracks }
    saveLocalLibrary(next)
    return next
}

/** 父目录作为 folderPath 记录，不绑定专辑文件夹限制 */
function parentFolderOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/")
    const idx = normalized.lastIndexOf("/")
    if (idx <= 0) {
        return ""
    }
    // Windows 盘符路径还原反斜杠风格由调用方原 path 父级更稳
    const fromNative = filePath.includes("\\")
        ? filePath.slice(0, Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")))
        : filePath.slice(0, idx)
    return fromNative || ""
}

function scanDtoToStored(
    item: ScanTrackDto,
    opts: {
        albumId: string | null
        albumTitle?: string
        albumArtist?: string
        folderPath?: string
    },
): StoredLocalTrack {
    const folderPath = opts.folderPath ?? parentFolderOf(item.path)
    const albumTitle = opts.albumTitle?.trim() || ""
    const albumArtist = opts.albumArtist?.trim() || ""
    return {
        id: item.id,
        title: item.title,
        artist:
            item.artist && item.artist !== "未知艺人"
                ? item.artist
                : albumArtist || item.artist || "未知艺人",
        album:
            item.album && item.album !== "本地文件"
                ? item.album
                : albumTitle || item.album || "本地文件",
        path: item.path,
        durationMs: item.durationMs ?? 0,
        folderPath,
        albumId: opts.albumId,
        coverPath: item.coverPath ?? null,
        lyricText: capLyricText(item.lyricText),
        lrcPath: item.lrcPath ?? null,
        fileName:
            stripExtension(item.fileName?.trim() || "") ||
            fileStemFromPath(item.path) ||
            null,
        contentHash: item.contentHash?.trim().toLowerCase() || null,
        metadataVersion: CURRENT_METADATA_VERSION,
        metadataScanned: true,
    }
}

/**
 * 向专辑或未分类追加任意路径的音频。
 * - 不按文件夹整夹替换
 * - 同 id 覆盖更新
 * - albumId = null 表示仅进「全部歌曲」
 */
function mergeScannedTracks(
    state: LocalLibraryState,
    scanned: ScanTrackDto[],
    albumId: string | null,
): LocalLibraryState {
    if (scanned.length === 0) {
        return state
    }

    const album =
        albumId != null
            ? state.albums.find((item) => item.id === albumId) ?? null
            : null

    if (albumId && !album) {
        return state
    }

    const ts = nowMs()
    const incoming = scanned.map((item) =>
        scanDtoToStored(item, {
            albumId: album?.id ?? null,
            albumTitle: album?.title,
            albumArtist: album?.artist,
        }),
    )

    const byId = new Map(state.tracks.map((track) => [track.id, track]))
    for (const track of incoming) {
        byId.set(track.id, track)
    }

    const folders = new Set(state.folders)
    for (const track of incoming) {
        if (track.folderPath && !folders.has(track.folderPath)) {
            folders.add(track.folderPath)
        }
    }

    const albums = album
        ? state.albums.map((item) =>
              item.id === album.id ? { ...item, updatedAt: ts } : item,
          )
        : state.albums

    const tracks = Array.from(byId.values()).sort((a, b) =>
        a.title.localeCompare(b.title, "zh-CN"),
    )

    const next: LocalLibraryState = {
        folders: Array.from(folders),
        artists: state.artists,
        albums,
        tracks,
    }
    saveLocalLibrary(next)
    return next
}

function mergeScannedTrackMeta(
    state: LocalLibraryState,
    scanned: ScanTrackDto[],
    attemptedTrackIds: ReadonlySet<string> = new Set(),
): LocalLibraryState {
    if (scanned.length === 0 && attemptedTrackIds.size === 0) {
        return state
    }

    const scannedById = new Map(scanned.map((item) => [item.id, item]))
    const tracks = state.tracks.map((track) => {
        const item = scannedById.get(track.id)
        if (!item) {
            return attemptedTrackIds.has(track.id)
                ? {
                      ...track,
                      metadataVersion: CURRENT_METADATA_VERSION,
                      metadataScanned: true,
                  }
                : track
        }

        const nextLyricText = capLyricText(item.lyricText)
        return {
            ...track,
            title: item.title?.trim() || track.title,
            artist: item.artist?.trim() || track.artist,
            durationMs: item.durationMs > 0 ? item.durationMs : track.durationMs,
            coverPath: item.coverPath?.trim() || track.coverPath,
            lyricText: nextLyricText || track.lyricText,
            lrcPath: item.lrcPath?.trim() || track.lrcPath,
            fileName:
                stripExtension(item.fileName?.trim() || "") ||
                track.fileName ||
                fileStemFromPath(item.path) ||
                null,
            contentHash:
                item.contentHash?.trim().toLowerCase() || track.contentHash,
            metadataVersion: CURRENT_METADATA_VERSION,
            metadataScanned: true,
        }
    })

    const next: LocalLibraryState = {
        ...state,
        tracks,
    }
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
        artists: state.artists,
        albums: state.albums.filter((album) => album.folderPath !== folderPath),
        tracks: state.tracks.filter((track) => track.folderPath !== folderPath),
    }
    saveLocalLibrary(next)
    return next
}

function removeAlbum(state: LocalLibraryState, albumId: string): LocalLibraryState {
    const album = state.albums.find((item) => item.id === albumId)
    const remainingAlbums = state.albums.filter((item) => item.id !== albumId)
    const remainingTracks = state.tracks.filter((track) => track.albumId !== albumId)
    const folderStillUsed = album?.folderPath
        ? remainingAlbums.some((item) => item.folderPath === album.folderPath) ||
          remainingTracks.some((track) => track.folderPath === album.folderPath)
        : true
    const next: LocalLibraryState = {
        folders:
            album?.folderPath && !folderStillUsed
                ? state.folders.filter((item) => item !== album.folderPath)
                : state.folders,
        artists: state.artists,
        albums: remainingAlbums,
        tracks: remainingTracks,
    }
    saveLocalLibrary(next)
    return next
}

/** 新增或更新艺人分组；folderPath 相同视为同一艺人（重扫时复用） */
function upsertArtist(
    state: LocalLibraryState,
    draft: Pick<LocalArtist, "name" | "folderPath" | "coverDataUrl">,
): { state: LocalLibraryState; artist: LocalArtist } {
    const ts = nowMs()
    const existing =
        draft.folderPath != null
            ? state.artists.find((item) => item.folderPath === draft.folderPath) ?? null
            : null
    let artists: LocalArtist[]
    let artist: LocalArtist
    if (existing) {
        artist = {
            ...existing,
            name: draft.name.trim() || existing.name,
            coverDataUrl: draft.coverDataUrl || existing.coverDataUrl,
            updatedAt: ts,
        }
        artists = state.artists.map((item) => (item.id === existing.id ? artist : item))
    } else {
        artist = {
            id: newArtistId(),
            name: draft.name.trim() || "未命名艺人",
            folderPath: draft.folderPath,
            coverDataUrl: draft.coverDataUrl,
            createdAt: ts,
            updatedAt: ts,
        }
        artists = [...state.artists, artist]
    }
    const next = { ...state, artists }
    saveLocalLibrary(next)
    return { state: next, artist }
}

/** 更新艺人信息；可选重命名，重命名时同步其下专辑 artist 字段 */
function updateArtist(
    state: LocalLibraryState,
    artistId: string,
    patch: Partial<Pick<LocalArtist, "name" | "coverDataUrl">>,
): LocalLibraryState {
    const ts = nowMs()
    let renamed = false
    const artists = state.artists.map((item) => {
        if (item.id !== artistId) {
            return item
        }
        const nextName = patch.name !== undefined ? patch.name.trim() : item.name
        renamed = nextName !== item.name && Boolean(nextName)
        return {
            ...item,
            name: nextName || item.name,
            coverDataUrl: patch.coverDataUrl !== undefined ? patch.coverDataUrl : item.coverDataUrl,
            updatedAt: ts,
        }
    })
    const artist = artists.find((item) => item.id === artistId)
    const albums = renamed && artist
        ? state.albums.map((album) =>
              album.artistId === artistId
                  ? { ...album, artist: artist.name, updatedAt: ts }
                  : album,
          )
        : state.albums
    const next = { ...state, artists, albums }
    saveLocalLibrary(next)
    return next
}

/** 删除艺人分组；其下专辑解除归属（保留专辑本身） */
function removeArtist(state: LocalLibraryState, artistId: string): LocalLibraryState {
    const artists = state.artists.filter((item) => item.id !== artistId)
    const albums = state.albums.map((album) =>
        album.artistId === artistId ? { ...album, artistId: null, updatedAt: nowMs() } : album,
    )
    const next = { ...state, artists, albums }
    saveLocalLibrary(next)
    return next
}

/** 批量移除专辑（连同曲目索引）；不删磁盘文件。已无引用的 folder 一并清理 */
function removeAlbumsBulk(
    state: LocalLibraryState,
    albumIds: ReadonlySet<string>,
): LocalLibraryState {
    if (albumIds.size === 0) {
        return state
    }
    const remainingAlbums = state.albums.filter((album) => !albumIds.has(album.id))
    const remainingTracks = state.tracks.filter(
        (track) => track.albumId == null || !albumIds.has(track.albumId),
    )
    const usedFolders = new Set<string>()
    for (const album of remainingAlbums) {
        if (album.folderPath) {
            usedFolders.add(album.folderPath)
        }
    }
    for (const track of remainingTracks) {
        if (track.folderPath) {
            usedFolders.add(track.folderPath)
        }
    }
    const next: LocalLibraryState = {
        folders: state.folders.filter((folder) => usedFolders.has(folder)),
        artists: state.artists,
        albums: remainingAlbums,
        tracks: remainingTracks,
    }
    saveLocalLibrary(next)
    return next
}

/**
 * 批量移除艺人分组。
 * - includeAlbums = false：仅解除专辑归属（专辑保留）
 * - includeAlbums = true：连同其下专辑与曲目索引一并移除
 */
function removeArtistsBulk(
    state: LocalLibraryState,
    artistIds: ReadonlySet<string>,
    includeAlbums: boolean,
): LocalLibraryState {
    if (artistIds.size === 0) {
        return state
    }
    const remainingArtists = state.artists.filter((artist) => !artistIds.has(artist.id))

    if (!includeAlbums) {
        const albums = state.albums.map((album) =>
            album.artistId != null && artistIds.has(album.artistId)
                ? { ...album, artistId: null, updatedAt: nowMs() }
                : album,
        )
        const next: LocalLibraryState = { ...state, artists: remainingArtists, albums }
        saveLocalLibrary(next)
        return next
    }

    const albumIds = new Set(
        state.albums
            .filter((album) => album.artistId != null && artistIds.has(album.artistId))
            .map((album) => album.id),
    )
    const remainingAlbums = state.albums.filter((album) => !albumIds.has(album.id))
    const remainingTracks = state.tracks.filter(
        (track) => track.albumId == null || !albumIds.has(track.albumId),
    )
    const usedFolders = new Set<string>()
    for (const album of remainingAlbums) {
        if (album.folderPath) {
            usedFolders.add(album.folderPath)
        }
    }
    for (const track of remainingTracks) {
        if (track.folderPath) {
            usedFolders.add(track.folderPath)
        }
    }
    const next: LocalLibraryState = {
        folders: state.folders.filter((folder) => usedFolders.has(folder)),
        artists: remainingArtists,
        albums: remainingAlbums,
        tracks: remainingTracks,
    }
    saveLocalLibrary(next)
    return next
}

/** 艺人下专辑数 / 曲目数统计 */
function artistAlbumCount(state: LocalLibraryState, artistId: string): number {
    return state.albums.filter((album) => album.artistId === artistId).length
}

function listAlbumsByArtist(state: LocalLibraryState, artistId: string): LocalAlbum[] {
    return state.albums.filter((album) => album.artistId === artistId)
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
        fileName: item.fileName ?? undefined,
        contentHash: item.contentHash ?? undefined,
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
    CURRENT_METADATA_VERSION,
    LOCAL_LIBRARY_EVENT,
    STORAGE_KEY,
    artistAlbumCount,
    clearLocalLibrary,
    createEmptyAlbum,
    folderDisplayName,
    listAlbumsByArtist,
    listLocalPlayableTracks,
    listTracksByAlbum,
    loadLocalLibrary,
    mergeFolderScan,
    mergeScannedTrackMeta,
    mergeScannedTracks,
    removeAlbum,
    removeAlbumsBulk,
    removeArtist,
    removeArtistsBulk,
    removeFolder,
    resolveAlbumCoverUrl,
    saveLocalLibrary,
    storedToTrack,
    toAssetUrl,
    updateAlbum,
    updateArtist,
    upsertArtist,
}
export type { ScanTrackDto }