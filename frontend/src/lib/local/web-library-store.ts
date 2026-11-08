import type {
    AlbumDraft,
    LocalAlbum,
    LocalArtist,
} from "@/lib/local/library-store"
import type { WebLocalTrack } from "@/lib/local/web-import"

// 网页版本地库分组：艺人/专辑存 localStorage（纯 JSON，量小），曲目走 IndexedDB
// 复用 PC 版 library-store 的 LocalArtist/LocalAlbum 类型，UI 组件可无缝共用

const META_KEY = "musicstorm.web.library.meta"

type WebLibraryMeta = {
    artists: LocalArtist[]
    albums: LocalAlbum[]
}

type WebLibraryState = WebLibraryMeta & {
    tracks: WebLocalTrack[]
}

function nowMs(): number {
    return Date.now()
}

function newArtistId(): string {
    return `artist:${nowMs().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

function newAlbumId(): string {
    return `album:${nowMs().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

function emptyMeta(): WebLibraryMeta {
    return { artists: [], albums: [] }
}

function loadMeta(): WebLibraryMeta {
    if (typeof window === "undefined") {
        return emptyMeta()
    }
    try {
        const raw = window.localStorage.getItem(META_KEY)
        if (!raw) {
            return emptyMeta()
        }
        const parsed = JSON.parse(raw) as Partial<WebLibraryMeta>
        return {
            artists: Array.isArray(parsed.artists) ? parsed.artists : [],
            albums: Array.isArray(parsed.albums) ? parsed.albums : [],
        }
    } catch {
        return emptyMeta()
    }
}

function saveMeta(meta: WebLibraryMeta): void {
    try {
        window.localStorage.setItem(META_KEY, JSON.stringify(meta))
    } catch {
        // 存储不可用降级为内存会话
    }
}

/** 新增艺人分组 */
function createArtist(
    state: WebLibraryState,
    draft: { name: string; coverDataUrl?: string },
): { state: WebLibraryState; artist: LocalArtist } {
    const ts = nowMs()
    const artist: LocalArtist = {
        id: newArtistId(),
        name: draft.name.trim() || "未命名艺人",
        folderPath: null,
        coverDataUrl: draft.coverDataUrl ?? "",
        createdAt: ts,
        updatedAt: ts,
    }
    return { state: { ...state, artists: [...state.artists, artist] }, artist }
}

/** 更新艺人；重命名时同步其下专辑的 artist 字段 */
function updateArtist(
    state: WebLibraryState,
    artistId: string,
    patch: { name?: string; coverDataUrl?: string },
): WebLibraryState {
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
            coverDataUrl:
                patch.coverDataUrl !== undefined
                    ? patch.coverDataUrl
                    : item.coverDataUrl,
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
    return { ...state, artists, albums }
}

/**
 * 删除艺人分组。
 * includeAlbums=false 仅解除专辑归属（专辑保留）；
 * includeAlbums=true 连同其下专辑与曲目归属一并移除（文件仍留在浏览器存储）。
 */
function removeArtist(
    state: WebLibraryState,
    artistId: string,
    includeAlbums: boolean,
): WebLibraryState {
    const remainingArtists = state.artists.filter((item) => item.id !== artistId)
    if (!includeAlbums) {
        const albums = state.albums.map((album) =>
            album.artistId === artistId
                ? { ...album, artistId: null, updatedAt: nowMs() }
                : album,
        )
        return { ...state, artists: remainingArtists, albums }
    }
    const albumIds = new Set(
        state.albums
            .filter((album) => album.artistId === artistId)
            .map((album) => album.id),
    )
    const albums = state.albums.filter((album) => !albumIds.has(album.id))
    const tracks = state.tracks.map((track) =>
        track.localAlbumId != null && albumIds.has(track.localAlbumId)
            ? { ...track, localAlbumId: null }
            : track,
    )
    return { ...state, artists: remainingArtists, albums, tracks }
}

/** 新增专辑，可归属某艺人分组 */
function createAlbum(
    state: WebLibraryState,
    draft: AlbumDraft,
): { state: WebLibraryState; album: LocalAlbum } {
    const ts = nowMs()
    const artist =
        draft.artistId != null
            ? state.artists.find((item) => item.id === draft.artistId) ?? null
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
    return { state: { ...state, albums: [album, ...state.albums] }, album }
}

/** 更新专辑；同步其下曲目的 album 名 */
function updateAlbum(
    state: WebLibraryState,
    albumId: string,
    patch: Partial<Pick<LocalAlbum, "title" | "artist" | "artistId" | "coverDataUrl">>,
): WebLibraryState {
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
        const nextArtist =
            patch.artist !== undefined && patch.artist.trim()
                ? patch.artist.trim()
                : targetArtist
                  ? targetArtist.name
                  : album.artist
        return {
            ...album,
            title:
                patch.title !== undefined
                    ? patch.title.trim() || album.title
                    : album.title,
            artist: nextArtist,
            artistId: nextArtistId,
            coverDataUrl:
                patch.coverDataUrl !== undefined
                    ? patch.coverDataUrl
                    : album.coverDataUrl,
            updatedAt: ts,
        }
    })
    const album = albums.find((item) => item.id === albumId)
    const tracks = album
        ? state.tracks.map((track) =>
              track.localAlbumId === albumId
                  ? { ...track, album: album.title, artist: album.artist || track.artist }
                  : track,
          )
        : state.tracks
    return { ...state, albums, tracks }
}

/** 删除专辑；其下曲目解除归属（不删文件） */
function removeAlbum(state: WebLibraryState, albumId: string): WebLibraryState {
    const albums = state.albums.filter((item) => item.id !== albumId)
    const tracks = state.tracks.map((track) =>
        track.localAlbumId === albumId
            ? { ...track, localAlbumId: null }
            : track,
    )
    return { ...state, albums, tracks }
}

/**
 * 把导入的曲目按「艺人 → 专辑」分组并入库。
 * 目录导入（FSA）relativePath 第一段=专辑目录；散曲/无标签归入「{艺人} 精选」。
 * 艺人名优先取标签，目录导入且标签缺失时按目录名兜底。
 */
function groupImportedTracks(
    state: WebLibraryState,
    tracks: WebLocalTrack[],
    rootName = "",
    groupByFolder = true,
): WebLibraryState {
    if (tracks.length === 0) {
        return state
    }
    const artists = [...state.artists]
    const albums = [...state.albums]
    const artistByName = new Map(artists.map((item) => [item.name, item]))
    const albumByKey = new Map(
        albums.map((item) => [`${item.artistId ?? ""}:${item.title}`, item]),
    )

    const grouped = tracks.map((track) => {
        const dirParts = (track.relativePath ?? "").split("/").filter(Boolean)
        // 最后一段是文件名，倒数第二段是最内层文件夹（专辑名）。
        // 多层级（艺人/专辑/歌曲）时取最内层而非第一段，避免艺人名被误当专辑；
        // groupByFolder=false 时忽略文件夹，全部按标签/精选归组
        const albumDir =
            groupByFolder && dirParts.length >= 2
                ? dirParts[dirParts.length - 2]
                : null
        const artistName =
            track.artist && track.artist !== "未知艺人"
                ? track.artist.trim()
                : rootName || "未知艺人"
        const albumTitle =
            albumDir || track.album?.trim() || `${artistName} 精选`

        let artist = artistByName.get(artistName)
        if (!artist) {
            artist = {
                id: newArtistId(),
                name: artistName,
                folderPath: null,
                coverDataUrl: "",
                createdAt: nowMs(),
                updatedAt: nowMs(),
            }
            artistByName.set(artistName, artist)
            artists.push(artist)
        }

        const key = `${artist.id}:${albumTitle}`
        let album = albumByKey.get(key)
        if (!album) {
            album = {
                id: newAlbumId(),
                title: albumTitle,
                artist: artistName,
                artistId: artist.id,
                coverDataUrl: "",
                folderPath: null,
                createdAt: nowMs(),
                updatedAt: nowMs(),
            }
            albumByKey.set(key, album)
            albums.push(album)
        }

        return {
            ...track,
            localAlbumId: album.id,
            album: albumTitle,
            artist: artistName,
        }
    })

    return { artists, albums, tracks: [...state.tracks, ...grouped] }
}

function listAlbumsByArtist(state: WebLibraryState, artistId: string): LocalAlbum[] {
    return state.albums.filter((album) => album.artistId === artistId)
}

/** 艺人头像：手动封面优先，否则其下第一张专辑封面 */
function resolveArtistCover(state: WebLibraryState, artist: LocalArtist): string {
    if (artist.coverDataUrl) {
        return artist.coverDataUrl
    }
    const first = listAlbumsByArtist(state, artist.id)[0]
    return first ? resolveAlbumCover(state, first) : ""
}

/** 专辑封面：手动封面优先，否则其下曲目内嵌封面 */
function resolveAlbumCover(state: WebLibraryState, album: LocalAlbum): string {
    if (album.coverDataUrl) {
        return album.coverDataUrl
    }
    const track = state.tracks.find(
        (item) => item.localAlbumId === album.id && item.coverUrl,
    )
    return track?.coverUrl ?? ""
}

export {
    createAlbum,
    createArtist,
    groupImportedTracks,
    listAlbumsByArtist,
    loadMeta,
    removeAlbum,
    removeArtist,
    resolveAlbumCover,
    resolveArtistCover,
    saveMeta,
    updateAlbum,
    updateArtist,
}
export type { WebLibraryMeta, WebLibraryState }
