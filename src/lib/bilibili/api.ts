import { bilibiliRequest } from "@/lib/bilibili/client"

type BilibiliSearchItem = {
    type?: string
    id?: number
    aid?: number
    bvid?: string
    title?: string
    author?: string
    pic?: string
 cover?: string
 pic_url?: string
    duration?: string | number
    play?: number
    owner?: { name?: string }
    stat?: { view?: number }
    typeid?: number
    typename?: string
}

type BilibiliSearchData = {
    result?: BilibiliSearchItem[] | { result?: BilibiliSearchItem[] }
}

type BilibiliPopularData = {
    list?: BilibiliSearchItem[]
}

type BilibiliRankingData = {
 list?: BilibiliSearchItem[]
}

type BilibiliPage = {
    cid?: number
    page?: number
    part?: string
    duration?: number
 pic?: string
}

type BilibiliVideoData = {
    bvid?: string
    aid?: number
    cid?: number
    title?: string
    tname?: string
    pic?: string
 cover?: string
    duration?: number
 videos?: number
    owner?: { name?: string }
    pages?: BilibiliPage[]
    stat?: { view?: number }
}

type BilibiliAudioStream = {
    id?: number
    baseUrl?: string
    base_url?: string
    backupUrl?: string | string[]
    backup_url?: string | string[]
    bandwidth?: number
    mimeType?: string
    mime_type?: string
    codecs?: string
}

type BilibiliDash = {
 audio?: BilibiliAudioStream[]
 flac?:
 | BilibiliAudioStream
 | BilibiliAudioStream[]
 | {
 audio?:
 | BilibiliAudioStream
 | BilibiliAudioStream[]
 | null
 }
 | null
 dolby?:
 | {
 audio?:
 | BilibiliAudioStream
 | BilibiliAudioStream[]
 | null
 }
 | null
}

type BilibiliPlayData = {
 durl?: Array<{
 url?: string
 backup_url?: string[]
 length?: number
 }>
 timelength?: number
 dash?: BilibiliDash
}

async function searchBilibiliVideos(input: {
    keyword: string
    page: number
    pageSize: number
 tid?: number
}): Promise<BilibiliSearchItem[]> {
    const data = await bilibiliRequest<BilibiliSearchData>({
        path: "/x/web-interface/wbi/search/type",
        params: {
            keyword: input.keyword,
            search_type: "video",
            page: input.page,
            page_size: input.pageSize,
            order: "totalrank",
 ...(input.tid != null ? { tid: input.tid } : {}),
        },
    })
    const result = data.result
    if (Array.isArray(result)) {
        return result
    }
    return result?.result ?? []
}

async function fetchBilibiliVideo(input: {
    bvid?: string
    aid?: number
}): Promise<BilibiliVideoData> {
    return bilibiliRequest<BilibiliVideoData>({
        path: "/x/web-interface/view",
        params: {
            ...(input.bvid ? { bvid: input.bvid } : {}),
            ...(input.aid != null ? { aid: input.aid } : {}),
        },
        wbi: false,
    })
}

async function fetchBilibiliPopularVideos(input: {
    page: number
    pageSize: number
}): Promise<BilibiliSearchItem[]> {
    const data = await bilibiliRequest<BilibiliPopularData>({
        path: "/x/web-interface/popular",
        params: {
            pn: input.page,
            ps: input.pageSize,
        },
        wbi: false,
    })
    return data.list ?? []
}

async function fetchBilibiliMusicRanking(input: {
 rid: number
 type?: string
}): Promise<BilibiliSearchItem[]> {
 const data = await bilibiliRequest<BilibiliRankingData>({
 path: "/x/web-interface/ranking/v2",
 params: {
 rid: input.rid,
 type: input.type ?? "all",
 web_location: "333.934",
 },
 })
 return data.list ?? []
}

async function fetchBilibiliPlayData(input: {
    bvid: string
    cid: number
}): Promise<BilibiliPlayData> {
    return bilibiliRequest<BilibiliPlayData>({
        path: "/x/player/wbi/playurl",
        params: {
            bvid: input.bvid,
            cid: input.cid,
            fnval: 4048,
            fnver: 0,
            fourk: 1,
        },
    })
}

export {
    fetchBilibiliPlayData,
 fetchBilibiliMusicRanking,
    fetchBilibiliPopularVideos,
    fetchBilibiliVideo,
    searchBilibiliVideos,
}
export type {
 BilibiliDash,
    BilibiliAudioStream,
    BilibiliPlayData,
    BilibiliSearchItem,
    BilibiliVideoData,
}
