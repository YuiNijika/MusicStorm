import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Radio, Track } from "@/lib/types"

type CloudSearchData = {
    result?: {
        songs?: NeteaseSong[]
        songCount?: number
        albums?: NeteaseAlbumHitRaw[]
        albumCount?: number
        artists?: NeteaseArtistHitRaw[]
        artistCount?: number
        playlists?: NeteasePlaylistHitRaw[]
        playlistCount?: number
        djRadios?: NeteaseDjHitRaw[]
        djRadiosCount?: number
    }
    code?: number
}

type NeteaseAlbumHitRaw = {
    id?: number
    name?: string
    picUrl?: string
    size?: number
    publishTime?: number
    artist?: { id?: number; name?: string }
    artists?: { id?: number; name?: string }[]
}

type NeteaseArtistHitRaw = {
    id?: number
    name?: string
    picUrl?: string
    img1v1Url?: string
    albumSize?: number
    musicSize?: number
}

type NeteasePlaylistHitRaw = {
    id?: number
    name?: string
    coverImgUrl?: string
    trackCount?: number
    playCount?: number
    creator?: { nickname?: string }
    description?: string
}

type NeteaseDjHitRaw = {
    id?: number
    name?: string
    picUrl?: string
    programCount?: number
    desc?: string
    dj?: { nickname?: string }
    category?: string
}

export type NeteaseAlbumHit = {
    id: string
    title: string
    artistName: string
    coverUrl: string
    trackCount?: number
    year?: number
}

export type NeteaseArtistHit = {
    id: string
    name: string
    coverUrl: string
    albumSize?: number
    musicSize?: number
}

export type NeteasePlaylistHit = {
    id: string
    title: string
    coverUrl: string
    trackCount?: number
    creatorName?: string
}

export type NeteaseSearchBundle = {
    tracks: Track[]
    artists: NeteaseArtistHit[]
    albums: NeteaseAlbumHit[]
    playlists: NeteasePlaylistHit[]
    radios: Radio[]
}

async function searchNeteaseTracks(keywords: string, limit = 30): Promise<Track[]> {
    const trimmed = keywords.trim()
    if (!trimmed) {
        return []
    }

    const data = await neteaseRequest<CloudSearchData>({
        path: NETEASE_PATHS.search,
        params: {
            keywords: trimmed,
            type: 1,
            limit,
        },
    })

    const songs = data.result?.songs ?? []
    return songs.map(mapNeteaseSongToTrack)
}

/** type=10 专辑搜索 */
async function searchNeteaseAlbums(
    keywords: string,
    limit = 20,
): Promise<NeteaseAlbumHit[]> {
    const trimmed = keywords.trim()
    if (!trimmed) {
        return []
    }

    const data = await neteaseRequest<CloudSearchData>({
        path: NETEASE_PATHS.search,
        params: {
            keywords: trimmed,
            type: 10,
            limit,
        },
    })

    const albums = data.result?.albums ?? []
    return albums
        .map((item): NeteaseAlbumHit | null => {
            if (item.id == null) {
                return null
            }
            const artists = item.artists ?? (item.artist ? [item.artist] : [])
            const artistName =
                artists
                    .map((artist) => artist.name)
                    .filter(Boolean)
                    .join(" / ") || "未知艺人"
            return {
                id: String(item.id),
                title: item.name?.trim() || "未知专辑",
                artistName,
                coverUrl: item.picUrl ? `${item.picUrl}?param=480y480` : "",
                trackCount: item.size,
                year: item.publishTime
                    ? new Date(item.publishTime).getFullYear()
                    : undefined,
            }
        })
        .filter((item): item is NeteaseAlbumHit => item != null)
}

async function searchNeteaseArtists(
    keywords: string,
    limit = 12,
): Promise<NeteaseArtistHit[]> {
    const trimmed = keywords.trim()
    if (!trimmed) {
        return []
    }

    const data = await neteaseRequest<CloudSearchData>({
        path: NETEASE_PATHS.search,
        params: {
            keywords: trimmed,
            type: 100,
            limit,
        },
    })

    const artists = data.result?.artists ?? []
    return artists
        .map((item): NeteaseArtistHit | null => {
            if (item.id == null) {
                return null
            }
            const pic = item.picUrl || item.img1v1Url
            return {
                id: String(item.id),
                name: item.name?.trim() || "未知艺人",
                coverUrl: pic ? `${pic}?param=400y400` : "",
                albumSize: item.albumSize,
                musicSize: item.musicSize,
            }
        })
        .filter((item): item is NeteaseArtistHit => item != null)
}

async function searchNeteasePlaylists(
    keywords: string,
    limit = 12,
): Promise<NeteasePlaylistHit[]> {
    const trimmed = keywords.trim()
    if (!trimmed) {
        return []
    }

    const data = await neteaseRequest<CloudSearchData>({
        path: NETEASE_PATHS.search,
        params: {
            keywords: trimmed,
            type: 1000,
            limit,
        },
    })

    const playlists = data.result?.playlists ?? []
    return playlists
        .map((item): NeteasePlaylistHit | null => {
            if (item.id == null) {
                return null
            }
            return {
                id: String(item.id),
                title: item.name?.trim() || "未知歌单",
                coverUrl: item.coverImgUrl
                    ? `${item.coverImgUrl}?param=480y480`
                    : "",
                trackCount: item.trackCount,
                creatorName: item.creator?.nickname,
            }
        })
        .filter((item): item is NeteasePlaylistHit => item != null)
}

async function searchNeteaseRadios(
    keywords: string,
    limit = 12,
): Promise<Radio[]> {
    const trimmed = keywords.trim()
    if (!trimmed) {
        return []
    }

    const data = await neteaseRequest<CloudSearchData>({
        path: NETEASE_PATHS.search,
        params: {
            keywords: trimmed,
            type: 1009,
            limit,
        },
    })

    const radios = data.result?.djRadios ?? []
    return radios
        .map((item): Radio | null => {
            if (item.id == null) {
                return null
            }
            return {
                id: String(item.id),
                title: item.name?.trim() || "未知电台",
                coverUrl: item.picUrl ? `${item.picUrl}?param=480y480` : "",
                description: item.desc,
                programCount: item.programCount,
                djName: item.dj?.nickname,
                category: item.category,
            }
        })
        .filter((item): item is Radio => item != null)
}

/** 多类型并行搜索；单项失败不影响其他分区 */
async function searchNeteaseAll(
    keywords: string,
): Promise<NeteaseSearchBundle> {
    const trimmed = keywords.trim()
    if (!trimmed) {
        return {
            tracks: [],
            artists: [],
            albums: [],
            playlists: [],
            radios: [],
        }
    }

    const [tracksR, artistsR, albumsR, playlistsR, radiosR] =
        await Promise.allSettled([
            searchNeteaseTracks(trimmed, 20),
            searchNeteaseArtists(trimmed, 12),
            searchNeteaseAlbums(trimmed, 12),
            searchNeteasePlaylists(trimmed, 12),
            searchNeteaseRadios(trimmed, 10),
        ])

    const empty: NeteaseSearchBundle = {
        tracks: [],
        artists: [],
        albums: [],
        playlists: [],
        radios: [],
    }

    if (
        tracksR.status === "rejected" &&
        artistsR.status === "rejected" &&
        albumsR.status === "rejected" &&
        playlistsR.status === "rejected" &&
        radiosR.status === "rejected"
    ) {
        throw tracksR.reason instanceof Error
            ? tracksR.reason
            : new Error("搜索失败")
    }

    return {
        tracks: tracksR.status === "fulfilled" ? tracksR.value : empty.tracks,
        artists:
            artistsR.status === "fulfilled" ? artistsR.value : empty.artists,
        albums: albumsR.status === "fulfilled" ? albumsR.value : empty.albums,
        playlists:
            playlistsR.status === "fulfilled"
                ? playlistsR.value
                : empty.playlists,
        radios: radiosR.status === "fulfilled" ? radiosR.value : empty.radios,
    }
}

export {
    searchNeteaseTracks,
    searchNeteaseAlbums,
    searchNeteaseArtists,
    searchNeteasePlaylists,
    searchNeteaseRadios,
    searchNeteaseAll,
}

