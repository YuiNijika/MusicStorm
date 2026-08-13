import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

type FmData = {
    code?: number
    data?: NeteaseSong[]
}

// 私人 FM：一次返回多首，data 为歌曲数组
async function fetchPersonalFm(): Promise<Track[]> {
    const data = await neteaseRequest<FmData>({
        path: NETEASE_PATHS.personalFm,
        skipCache: true,
    })
    return (data.data ?? []).map(mapNeteaseSongToTrack)
}

// 私人 FM 垃圾桶：标记不喜欢
async function fmTrash(id: string): Promise<void> {
    await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.fmTrash,
        params: { id },
        skipCache: true,
    })
}

type IntelligenceData = {
    code?: number
    data?: NeteaseSong[]
}

// 心动模式 / 智能播放：按歌曲 + 歌单生成智能推荐队列
async function fetchIntelligencePlaylist(
    songId: string,
    playlistId?: string,
): Promise<Track[]> {
    const data = await neteaseRequest<IntelligenceData>({
        path: NETEASE_PATHS.playmodeIntelligenceList,
        params: { id: songId, pid: playlistId },
        skipCache: true,
    })
    return (data.data ?? []).map(mapNeteaseSongToTrack)
}

export { fetchIntelligencePlaylist, fetchPersonalFm, fmTrash }
