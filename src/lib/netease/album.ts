import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

type AlbumApiData = {
    code?: number
    album?: {
        id?: number
        name?: string
        picUrl?: string
        description?: string
        size?: number
        publishTime?: number
        artist?: { id?: number; name?: string }
        artists?: { id?: number; name?: string }[]
    }
    songs?: NeteaseSong[]
}

export type AlbumProfile = {
    id: string
    title: string
    coverUrl: string
    description: string
    trackCount?: number
    year?: number
    artistName: string
    artistId?: string
}

export type AlbumDetailResult = {
    profile: AlbumProfile
    tracks: Track[]
}

async function fetchAlbumDetail(albumId: string): Promise<AlbumDetailResult> {
    const id = albumId.trim()
    if (!/^\d+$/.test(id)) {
        throw new Error("无效专辑 id")
    }

    const data = await neteaseRequest<AlbumApiData>({
        path: NETEASE_PATHS.album,
        params: { id },
    })

    const album = data.album
    if (!album) {
        throw new Error("专辑不存在或接口未返回数据")
    }

    const artists = album.artists ?? (album.artist ? [album.artist] : [])
    const primary = artists[0]
    const artistName =
        artists
            .map((item) => item.name)
            .filter(Boolean)
            .join(" / ") || "未知艺人"

    const profile: AlbumProfile = {
        id,
        title: album.name ?? "未知专辑",
        coverUrl: album.picUrl ? `${album.picUrl}?param=480y480` : "",
        description: album.description?.trim() || "",
        trackCount: album.size,
        year: album.publishTime
            ? new Date(album.publishTime).getFullYear()
            : undefined,
        artistName,
        artistId: primary?.id != null ? String(primary.id) : undefined,
    }

    const tracks = (data.songs ?? []).map(mapNeteaseSongToTrack)
    return { profile, tracks }
}

type AlbumSublistData = {
    code?: number
    count?: number
    data?: Array<{
        id?: number
        name?: string
        picUrl?: string
        size?: number
        artists?: { id?: number; name?: string }[]
        artist?: { id?: number; name?: string }
    }>
}

export type AlbumCard = {
    id: string
    title: string
    coverUrl: string
    artistName: string
    trackCount?: number
}

/** 已收藏专辑，需登录 */
async function fetchAlbumSublist(limit = 1000, offset = 0): Promise<AlbumCard[]> {
    const data = await neteaseRequest<AlbumSublistData>({
        path: NETEASE_PATHS.albumSublist,
        params: { limit, offset },
        skipCache: true,
    })
    return (data.data ?? [])
        .map((item) => {
            if (item.id == null) {
                return null
            }
            const artists = item.artists ?? (item.artist ? [item.artist] : [])
            return {
                id: String(item.id),
                title: item.name?.trim() || "未知专辑",
                coverUrl: item.picUrl ? `${item.picUrl}?param=480y480` : "",
                artistName:
                    artists
                        .map((a) => a.name)
                        .filter(Boolean)
                        .join(" / ") || "未知艺人",
                trackCount: item.size,
            } satisfies AlbumCard
        })
        .filter((item): item is AlbumCard => item != null)
}

async function subscribeAlbum(albumId: string, subscribe: boolean): Promise<void> {
    const id = albumId.trim()
    if (!/^\d+$/.test(id)) {
        throw new Error("无效专辑 id")
    }
    await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.albumSub,
        params: { id, t: subscribe ? 1 : 0 },
        skipCache: true,
    })
}

export { fetchAlbumDetail, fetchAlbumSublist, subscribeAlbum }