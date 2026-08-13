import type { AlbumCard } from "@/lib/netease/album"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

// 新碟上架地区：ALL 全部 / ZH 华语 / EA 欧美 / KR 韩国 / JP 日本
export type AlbumArea = "ALL" | "ZH" | "EA" | "KR" | "JP"

type AlbumNewData = {
    code?: number
    albums?: Array<{
        id?: number
        name?: string
        picUrl?: string
        size?: number
        artist?: { id?: number; name?: string }
        artists?: { id?: number; name?: string }[]
    }>
}

async function fetchNewAlbums(
    area: AlbumArea = "ALL",
    limit = 30,
    offset = 0,
): Promise<AlbumCard[]> {
    const data = await neteaseRequest<AlbumNewData>({
        path: NETEASE_PATHS.albumNew,
        params: { area, limit, offset },
    })
    return (data.albums ?? [])
        .filter((item) => item.id != null)
        .map((item) => {
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
            }
        })
}

type TopSongData = {
    code?: number
    data?: NeteaseSong[]
}

// 新歌速递地区：0 全部 / 7 华语 / 96 欧美 / 8 日本 / 16 韩国
async function fetchTopSongs(type = 0): Promise<Track[]> {
    const data = await neteaseRequest<TopSongData>({
        path: NETEASE_PATHS.topSong,
        params: { type },
    })
    return (data.data ?? []).map(mapNeteaseSongToTrack)
}

export { fetchNewAlbums, fetchTopSongs }
