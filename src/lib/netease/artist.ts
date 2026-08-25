import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

type ArtistApiData = {
    code?: number
    artist?: {
        id?: number
        name?: string
        picUrl?: string
        briefDesc?: string
        albumSize?: number
        musicSize?: number
    }
    hotSongs?: NeteaseSong[]
}

type ArtistAlbumApiData = {
    code?: number
    hotAlbums?: {
        id?: number
        name?: string
        picUrl?: string
        size?: number
        publishTime?: number
    }[]
}

type ArtistSongsApiData = {
    code?: number
    songs?: NeteaseSong[]
}

type ArtistMvApiData = {
    code?: number
    mvs?: {
        id?: number
        name?: string
        imgurl?: string
        imgurl16v9?: string
        playCount?: number
        duration?: number
        artistName?: string
    }[]
}

type ArtistDescApiData = {
    code?: number
    briefDesc?: string
    introduction?: { ti?: string; txt?: string }[]
}

type SimiArtistApiData = {
    code?: number
    artists?: {
        id?: number
        name?: string
        picUrl?: string
        img1v1Url?: string
        albumSize?: number
    }[]
}

export type ArtistProfile = {
    id: string
    name: string
    coverUrl: string
    brief: string
    albumCount?: number
    songCount?: number
}

export type ArtistAlbumCard = {
    id: string
    title: string
    coverUrl: string
    trackCount?: number
    year?: number
}

export type ArtistMvCard = {
    id: string
    title: string
    coverUrl: string
    playCount?: number
    durationMs?: number
    artistName?: string
}

export type ArtistDescSection = {
    title: string
    text: string
}

export type ArtistDescResult = {
    brief: string
    sections: ArtistDescSection[]
}

export type SimiArtistCard = {
    id: string
    name: string
    coverUrl: string
    albumCount?: number
}

export type ArtistDetailResult = {
    profile: ArtistProfile
    hotTracks: Track[]
    albums: ArtistAlbumCard[]
}

function assertArtistId(artistId: string): string {
    const id = artistId.trim()
    if (!/^\d+$/.test(id)) {
        throw new Error("无效歌手 id")
    }
    return id
}

async function fetchArtistDetail(artistId: string): Promise<ArtistDetailResult> {
    const id = assertArtistId(artistId)

    const [artistData, albumData] = await Promise.all([
        neteaseRequest<ArtistApiData>({
            path: NETEASE_PATHS.artists,
            params: { id },
        }),
        neteaseRequest<ArtistAlbumApiData>({
            path: NETEASE_PATHS.artistAlbum,
            params: { id, limit: 50, offset: 0 },
        }).catch(() => ({ hotAlbums: [] as ArtistAlbumApiData["hotAlbums"] })),
    ])

    const a = artistData.artist
    if (!a) {
        throw new Error("歌手不存在或接口未返回数据")
    }

    const profile: ArtistProfile = {
        id,
        name: a.name ?? "未知艺人",
        coverUrl: a.picUrl ? `${a.picUrl}?param=480y480` : "",
        brief: a.briefDesc?.trim() || "",
        albumCount: a.albumSize,
        songCount: a.musicSize,
    }

    const hotTracks = (artistData.hotSongs ?? []).map(mapNeteaseSongToTrack)
    const albums: ArtistAlbumCard[] = (albumData.hotAlbums ?? [])
        .filter((item) => item.id != null && item.name)
        .map((item) => ({
            id: String(item.id),
            title: item.name ?? "未知专辑",
            coverUrl: item.picUrl ? `${item.picUrl}?param=400y400` : "",
            trackCount: item.size,
            year: item.publishTime
                ? new Date(item.publishTime).getFullYear()
                : undefined,
        }))

    return { profile, hotTracks, albums }
}

/** 专辑分页：艺人页下滑追加用；映射与 fetchArtistDetail 首屏保持一致 */
async function fetchArtistAlbumsPage(
    artistId: string,
    offset: number,
    limit = 50,
): Promise<ArtistAlbumCard[]> {
    const id = assertArtistId(artistId)
    const data = await neteaseRequest<ArtistAlbumApiData>({
        path: NETEASE_PATHS.artistAlbum,
        params: { id, limit, offset },
    })
    return (data.hotAlbums ?? [])
        .filter((item) => item.id != null && item.name)
        .map((item) => ({
            id: String(item.id),
            title: item.name ?? "未知专辑",
            coverUrl: item.picUrl ? `${item.picUrl}?param=400y400` : "",
            trackCount: item.size,
            year: item.publishTime
                ? new Date(item.publishTime).getFullYear()
                : undefined,
        }))
}

async function fetchArtistMvs(artistId: string): Promise<ArtistMvCard[]> {
    const id = assertArtistId(artistId)
    const data = await neteaseRequest<ArtistMvApiData>({
        path: NETEASE_PATHS.artistMv,
        params: { id, limit: 40, offset: 0 },
    })
    return (data.mvs ?? [])
        .filter((item) => item.id != null && item.name)
        .map((item) => {
            const cover = item.imgurl16v9 || item.imgurl || ""
            return {
                id: String(item.id),
                title: item.name ?? "未知 MV",
                coverUrl: cover ? `${cover}?param=480y270` : "",
                playCount: item.playCount,
                durationMs: item.duration,
                artistName: item.artistName,
            }
        })
}

async function fetchArtistDesc(artistId: string): Promise<ArtistDescResult> {
    const id = assertArtistId(artistId)
    const data = await neteaseRequest<ArtistDescApiData>({
        path: NETEASE_PATHS.artistDesc,
        params: { id },
    })
    const sections = (data.introduction ?? [])
        .map((item) => ({
            title: item.ti?.trim() || "简介",
            text: item.txt?.trim() || "",
        }))
        .filter((item) => item.text.length > 0)
    return {
        brief: data.briefDesc?.trim() || "",
        sections,
    }
}

async function fetchSimiArtists(artistId: string): Promise<SimiArtistCard[]> {
    const id = assertArtistId(artistId)
    const data = await neteaseRequest<SimiArtistApiData>({
        path: NETEASE_PATHS.simiArtist,
        params: { id },
    })
    return (data.artists ?? [])
        .filter((item) => item.id != null && item.name)
        .map((item) => {
            const pic = item.picUrl || item.img1v1Url || ""
            return {
                id: String(item.id),
                name: item.name ?? "未知艺人",
                coverUrl: pic ? `${pic}?param=400y400` : "",
                albumCount: item.albumSize,
            }
        })
}

type ArtistSublistApiData = {
    code?: number
    data?:
        | Array<{ id?: number; name?: string; picUrl?: string; albumSize?: number }>
        | { artists?: Array<{ id?: number; name?: string; picUrl?: string; albumSize?: number }> }
}

// 关注歌手列表（需要登录）
async function fetchArtistSublist(limit = 50): Promise<SimiArtistCard[]> {
    const data = await neteaseRequest<ArtistSublistApiData>({
        path: NETEASE_PATHS.artistSublist,
        params: { limit, offset: 0 },
        skipCache: true,
    })
    const raw = data.data
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray(raw.artists)
          ? raw.artists
          : []
    return list
        .filter((item) => item.id != null)
        .map((item) => ({
            id: String(item.id),
            name: item.name?.trim() || "未知歌手",
            coverUrl: item.picUrl ? `${item.picUrl}?param=400y400` : "",
            albumCount: item.albumSize,
        }))
}

async function subscribeArtist(artistId: string, subscribe: boolean): Promise<void> {
    await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.artistSub,
        params: { id: artistId, t: subscribe ? 1 : 0 },
        skipCache: true,
    })
}

/** 歌手全部歌曲分页：热门序 offset 从 hotSongs.length 起跳，避开 /artists 重叠段 */
async function fetchArtistSongsPage(
    artistId: string,
    offset: number,
    limit = 50,
): Promise<Track[]> {
    const id = assertArtistId(artistId)
    const data = await neteaseRequest<ArtistSongsApiData>({
        path: NETEASE_PATHS.artistSongs,
        params: { id, limit, offset },
    })
    return (data.songs ?? []).map(mapNeteaseSongToTrack)
}

export {
    fetchArtistAlbumsPage,
    fetchArtistDesc,
    fetchArtistDetail,
    fetchArtistMvs,
    fetchArtistSongsPage,
    fetchArtistSublist,
    fetchSimiArtists,
    subscribeArtist,
}