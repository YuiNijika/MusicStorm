import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Track } from "@/lib/types"

type RecordItem = {
    song?: NeteaseSong
    playCount?: number
}

type RecordData = {
    code?: number
    allData?: RecordItem[]
    weekData?: RecordItem[]
}

// 网易云听歌排行：type=0 所有时间，type=1 最近一周
async function fetchUserRecord(
    uid: number,
    type: 0 | 1 = 0,
): Promise<Track[]> {
    const data = await neteaseRequest<RecordData>({
        path: NETEASE_PATHS.userRecord,
        params: { uid, type },
        skipCache: true,
    })
    const items = type === 1 ? (data.weekData ?? []) : (data.allData ?? [])
    return items
        .map((item) => item.song)
        .filter((song): song is NeteaseSong => song != null && song.id != null)
        .map(mapNeteaseSongToTrack)
}

export { fetchUserRecord }
