import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import { fetchSongDetail } from "@/lib/netease/track"
import type { Playlist, Track } from "@/lib/types"

type PersonalizedItem = {
    id: number
    name: string
    picUrl?: string
    coverImgUrl?: string
    playCount?: number
    trackCount?: number
    copywriter?: string
}

type PersonalizedData = {
    result?: PersonalizedItem[]
    code?: number
}

type PlaylistDetailData = {
    playlist?: {
        id: number
        name: string
        coverImgUrl?: string
        description?: string
        trackCount?: number
        tracks?: NeteaseSong[]
        trackIds?: Array<{ id: number }>
    }
    privileges?: unknown[]
    code?: number
}

function mapPlaylistCard(item: PersonalizedItem): Playlist {
    return {
        id: String(item.id),
        title: item.name,
        coverUrl: item.picUrl ?? item.coverImgUrl ?? "",
        trackIds: [],
        source: "netease",
        description: item.copywriter,
        trackCount: item.trackCount,
    }
}

async function fetchRecommendPlaylists(limit = 12): Promise<Playlist[]> {
    const data = await neteaseRequest<PersonalizedData>({
        path: NETEASE_PATHS.personalized,
        params: { limit },
    })
    return (data.result ?? []).map(mapPlaylistCard)
}

async function fetchPlaylistDetail(id: string): Promise<{
    playlist: Playlist
    tracks: Track[]
}> {
    const data = await neteaseRequest<PlaylistDetailData>({
        path: NETEASE_PATHS.playlistDetail,
        params: { id },
    })

    const raw = data.playlist
    if (!raw) {
        throw new Error("歌单不存在")
    }

    let tracks = (raw.tracks ?? []).map(mapNeteaseSongToTrack)
    const trackIds = raw.trackIds?.map((item) => item.id) ?? []

    // 未登录 tracks 可能不完整，用 trackIds 与 song/detail 补齐最多 80 首
    if (trackIds.length > tracks.length) {
        const ids = trackIds.slice(0, 80).join(",")
        if (ids) {
            const detail = await fetchSongDetail(ids)
            tracks = (detail.songs ?? []).map(mapNeteaseSongToTrack)
        }
    }

    const playlist: Playlist = {
        id: String(raw.id),
        title: raw.name,
        coverUrl: raw.coverImgUrl ?? "",
        trackIds: tracks.map((track) => track.id),
        source: "netease",
        description: raw.description ?? undefined,
        trackCount: raw.trackCount ?? tracks.length,
    }

    return { playlist, tracks }
}

/**
 * 收藏 / 取消收藏歌单
 * t=1 收藏，t=2 取消
 */
async function subscribePlaylist(id: string, subscribe: boolean): Promise<void> {
    const data = await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.playlistSubscribe,
        method: "POST",
        params: {
            t: subscribe ? 1 : 2,
            id,
            timestamp: Date.now(),
        },
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(`歌单收藏失败: ${data.code}`)
    }
}

export { fetchPlaylistDetail, fetchRecommendPlaylists, subscribePlaylist }