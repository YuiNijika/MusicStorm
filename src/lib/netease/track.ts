import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"

type SongUrlData = {
    data?: Array<{
        id: number
        url: string | null
        br?: number
    }>
}

type SongDetailData = {
    songs?: Array<{
        id: number
        name: string
        ar?: Array<{ name: string }>
        al?: { name?: string; picUrl?: string }
        dt?: number
    }>
}

async function fetchSongUrl(id: string | number, br = 320_000) {
    return neteaseRequest<SongUrlData>({
        path: NETEASE_PATHS.songUrl,
        params: { id, br },
    })
}

async function fetchSongDetail(ids: string) {
    return neteaseRequest<SongDetailData>({
        path: NETEASE_PATHS.songDetail,
        params: { ids },
    })
}

export { fetchSongDetail, fetchSongUrl }