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

export { fetchAlbumDetail }