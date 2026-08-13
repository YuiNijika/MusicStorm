import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

type CloudItem = {
    simpleSong?: NeteaseSong
}

type CloudData = {
    code?: number
    data?: CloudItem[]
}

// 网易云云盘歌曲列表（需要登录），歌曲包在 simpleSong 字段里
async function fetchCloudTracks(limit = 50): Promise<Track[]> {
    const data = await neteaseRequest<CloudData>({
        path: NETEASE_PATHS.userCloud,
        params: { limit, offset: 0 },
        skipCache: true,
    })
    return (data.data ?? [])
        .map((item) => item.simpleSong)
        .filter((song): song is NeteaseSong => song != null && song.id != null)
        .map(mapNeteaseSongToTrack)
}

async function deleteCloudTrack(id: string): Promise<void> {
    await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.userCloudDel,
        params: { id },
        skipCache: true,
    })
}

export { deleteCloudTrack, fetchCloudTracks }
