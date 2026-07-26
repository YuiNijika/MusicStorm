import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import type { SongUrlItem } from "@/lib/netease/song-privilege"

type SongUrlData = {
    code?: number
    data?: SongUrlItem[]
}

type SongDetailData = {
    songs?: Array<{
        id: number
        name: string
        ar?: Array<{ name: string }>
        al?: { name?: string; picUrl?: string }
        dt?: number
        fee?: number
    }>
}

async function fetchSongUrl(id: string | number, br = 320_000) {
    return neteaseRequest<SongUrlData>({
        path: NETEASE_PATHS.songUrl,
        params: { id, br },
        // 播放地址必须实时
        skipCache: true,
    })
}

async function fetchSongDetail(ids: string) {
    return neteaseRequest<SongDetailData>({
        path: NETEASE_PATHS.songDetail,
        params: { ids },
    })
}

export { fetchSongDetail, fetchSongUrl }
export type { SongUrlData, SongUrlItem }