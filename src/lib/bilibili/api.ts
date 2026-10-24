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
    tid?: number
    tname?: string
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

type BilibiliUserCardData = {
 mid?: number
 name?: string
 face?: string
 fans?: number
 sign?: string
}

type BilibiliSeasonArchiveItem = {
 bvid?: string
 aid?: number
 title?: string
 pic?: string
 duration?: number
 author?: string
}

type BilibiliSeasonArchivesData = {
 archives?: BilibiliSeasonArchiveItem[]
 page?: {
 total?: number
 }
}

type BilibiliSeasonSeriesListData = {
 items_lists?: {
 page?: {
 total?: number
 }
 seasons_list?: Array<{
 meta?: {
 season_id?: number
 title?: string
 name?: string
 cover?: string
 description?: string
 total?: number
 }
 }>
 series_list?: Array<{
 meta?: {
 series_id?: number
 title?: string
 name?: string
 cover?: string
 total?: number
 }
 }>
 }
}

type BilibiliSeriesArchivesData = {
 archives?: BilibiliSeasonArchiveItem[]
 page?: {
 total?: number
 }
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

async function fetchBilibiliUserCard(
 mid: number,
): Promise<BilibiliUserCardData> {
 const data = await bilibiliRequest<{
 card?: BilibiliUserCardData
 }>({
 path: "/x/web-interface/card",
 params: { mid },
 wbi: false,
 })
 return data.card ?? {}
}

async function fetchBilibiliSeasonSeries(input: {
 mid: number
 page?: number
 pageSize?: number
}): Promise<BilibiliSeasonSeriesListData> {
 return bilibiliRequest<BilibiliSeasonSeriesListData>({
 path: "/x/polymer/web-space/seasons_series_list",
 params: {
 mid: input.mid,
 page_num: input.page ??1,
 page_size: input.pageSize ??20,
 },
 wbi: false,
 })
}

async function fetchBilibiliSeasonArchives(input: {
 mid: number
 seasonId: number
 page?: number
 pageSize?: number
}): Promise<BilibiliSeasonArchivesData> {
 return bilibiliRequest<BilibiliSeasonArchivesData>({
 path: "/x/polymer/web-space/seasons_archives_list",
 params: {
 mid: input.mid,
 season_id: input.seasonId,
 sort_reverse: "false",
 page_num: input.page ??1,
 page_size: input.pageSize ??30,
 web_location: "333.1387",
 },
 wbi: false,
 })
}

async function fetchBilibiliSeriesArchives(input: {
 mid: number
 seriesId: number
 page?: number
 pageSize?: number
}): Promise<BilibiliSeriesArchivesData> {
 return bilibiliRequest<BilibiliSeriesArchivesData>({
 path: "/x/series/archives",
 params: {
 mid: input.mid,
 series_id: input.seriesId,
 sort: "desc",
 pn: input.page ??1,
 ps: input.pageSize ??20,
 web_location: "333.1387",
 },
 wbi: false,
 })
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
 fetchBilibiliSeriesArchives,
 fetchBilibiliSeasonArchives,
 fetchBilibiliSeasonSeries,
 fetchBilibiliMusicRanking,
    fetchBilibiliPopularVideos,
 fetchBilibiliUserCard,
    fetchBilibiliVideo,
    searchBilibiliVideos,
}
export type {
 BilibiliDash,
    BilibiliAudioStream,
    BilibiliPlayData,
    BilibiliSearchItem,
 BilibiliSeasonArchiveItem,
 BilibiliSeasonArchivesData,
 BilibiliSeasonSeriesListData,
 BilibiliSeriesArchivesData,
 BilibiliUserCardData,
    BilibiliVideoData,
}
