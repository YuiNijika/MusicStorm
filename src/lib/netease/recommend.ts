import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

type RecommendSongsData = {
    code?: number
    data?: {
        dailySongs?: NeteaseSong[]
    }
    recommend?: NeteaseSong[]
}

/** 需登录：每日推荐曲 */
async function fetchDailyRecommendSongs(): Promise<Track[]> {
    const data = await neteaseRequest<RecommendSongsData>({
        path: NETEASE_PATHS.recommendSongs,
        params: { timestamp: Date.now() },
    })

    const songs = data.data?.dailySongs ?? data.recommend ?? []
    return songs.map(mapNeteaseSongToTrack)
}

export { fetchDailyRecommendSongs }