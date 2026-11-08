import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { neteaseCoverUrl } from "@/lib/netease/cover-url"
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
        creator?: {
            userId?: number
            nickname?: string
        }
    }
    privileges?: unknown[]
    code?: number
}

const DETAIL_CHUNK_SIZE = 200
const DETAIL_FETCH_CONCURRENCY = 2

function mapPlaylistCard(item: PersonalizedItem): Playlist {
    return {
        id: String(item.id),
        title: item.name,
        coverUrl: neteaseCoverUrl(item.picUrl ?? item.coverImgUrl, 480),
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

async function fetchSongsByIds(ids: number[]): Promise<NeteaseSong[]> {
    const chunks: number[][] = []
    for (let index = 0; index < ids.length; index += DETAIL_CHUNK_SIZE) {
        chunks.push(ids.slice(index, index + DETAIL_CHUNK_SIZE))
    }
    if (chunks.length === 0) {
        return []
    }

    const results = new Array<NeteaseSong[]>(chunks.length)
    let nextIndex = 0
    async function worker() {
        while (true) {
            const current = nextIndex
            nextIndex += 1
            const chunk = chunks[current]
            if (!chunk) {
                return
            }
            const detail = await fetchSongDetail(chunk.join(","))
            results[current] = detail.songs ?? []
        }
    }
    await Promise.all(
        Array.from(
            {
                length: Math.min(
                    DETAIL_FETCH_CONCURRENCY,
                    chunks.length,
                ),
            },
            () => worker(),
        ),
    )
    return results.flat()
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

    // 未登录 tracks 可能不完整，按批次补齐缺失曲目并保留云端顺序
    if (trackIds.length > 0) {
        const byId = new Map(tracks.map((track) => [Number(track.id), track]))
        const missing = trackIds.filter((id) => !byId.has(id))
        const songs = await fetchSongsByIds(missing)
        for (const song of songs) {
            byId.set(song.id, mapNeteaseSongToTrack(song))
        }
        tracks = trackIds
            .map((id) => byId.get(id))
            .filter((track): track is Track => track != null)
    }

    const playlist: Playlist = {
        id: String(raw.id),
        title: raw.name,
        coverUrl: neteaseCoverUrl(raw.coverImgUrl, 480),
        trackIds: tracks.map((track) => track.id),
        source: "netease",
        description: raw.description ?? undefined,
        trackCount: raw.trackCount ?? tracks.length,
        creator:
            raw.creator?.userId != null
                ? {
                      id: String(raw.creator.userId),
                      name: raw.creator.nickname ?? "",
                  }
                : undefined,
    }

    return { playlist, tracks }
}

// 轻量取歌单排头信息：云端第一首曲目 id 与其封面，tracks 为空时用 trackIds 补齐
async function fetchPlaylistHead(
    id: string,
): Promise<{ firstTrackId: string | null; firstCoverUrl: string | null }> {
    const data = await neteaseRequest<PlaylistDetailData>({
        path: NETEASE_PATHS.playlistDetail,
        params: { id },
    })
    const raw = data.playlist
    const firstTrack = raw?.tracks?.[0]
    if (firstTrack?.id != null) {
        return {
            firstTrackId: String(firstTrack.id),
            firstCoverUrl: neteaseCoverUrl(firstTrack.al?.picUrl, 480) || null,
        }
    }
    const firstId = raw?.trackIds?.[0]?.id
    if (firstId == null) {
        return { firstTrackId: null, firstCoverUrl: null }
    }
    try {
        const detail = await fetchSongDetail(String(firstId))
        const song = detail.songs?.[0]
        return {
            firstTrackId: String(firstId),
            firstCoverUrl: neteaseCoverUrl(song?.al?.picUrl, 480) || null,
        }
    } catch {
        return { firstTrackId: String(firstId), firstCoverUrl: null }
    }
}


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

async function createPlaylist(name: string, description?: string): Promise<string> {
    const data = await neteaseRequest<{
        code?: number
        id?: number
        playlist?: { id?: number }
    }>({
        path: NETEASE_PATHS.playlistCreate,
        method: "POST",
        params: { name, timestamp: Date.now() },
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(`创建歌单失败: ${data.code}`)
    }
    const id = data.id ?? data.playlist?.id
    if (!id) {
        throw new Error("创建歌单失败：未返回歌单 id")
    }
    // 创建接口只接受名称，介绍需在创建后单独更新
    const desc = description?.trim()
    if (desc) {
        await updatePlaylistDesc(String(id), desc)
    }
    return String(id)
}

async function updatePlaylistName(id: string, name: string): Promise<void> {
    const data = await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.playlistUpdateName,
        method: "POST",
        params: { id, name, timestamp: Date.now() },
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(`歌单改名失败: ${data.code}`)
    }
}

async function updatePlaylistDesc(id: string, desc: string): Promise<void> {
    const data = await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.playlistDescUpdate,
        method: "POST",
        params: { id, desc, timestamp: Date.now() },
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(`歌单介绍更新失败: ${data.code}`)
    }
}

type TopPlaylistItem = {
    id?: number
    name?: string
    coverImgUrl?: string
    trackCount?: number
    playCount?: number
}

// 分类歌单（网友精选碟）：cat 见 TOP_PLAYLIST_CATS，order hot/new
async function fetchTopPlaylists(
    cat = "全部",
    order: "hot" | "new" = "hot",
    limit = 50,
    offset = 0,
): Promise<Playlist[]> {
    const data = await neteaseRequest<{
        code?: number
        playlists?: TopPlaylistItem[]
    }>({
        path: NETEASE_PATHS.topPlaylist,
        params: { cat, order, limit, offset },
    })
    return (data.playlists ?? [])
        .filter((item) => item.id != null)
        .map((item) => ({
            id: String(item.id),
            title: item.name ?? "未知歌单",
            coverUrl: neteaseCoverUrl(item.coverImgUrl, 480),
            trackIds: [],
            source: "netease" as const,
            trackCount: item.trackCount,
        }))
}

async function deletePlaylist(id: string): Promise<void> {
    const data = await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.playlistDelete,
        method: "POST",
        params: { id, timestamp: Date.now() },
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(`删除歌单失败: ${data.code}`)
    }
}

export {
    createPlaylist,
    deletePlaylist,
    fetchPlaylistDetail,
    fetchPlaylistHead,
    fetchRecommendPlaylists,
    fetchTopPlaylists,
    subscribePlaylist,
    updatePlaylistDesc,
    updatePlaylistName,
}
