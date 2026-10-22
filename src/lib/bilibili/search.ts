import {
 fetchBilibiliMusicRanking as fetchRanking,
 fetchBilibiliPopularVideos,
 fetchBilibiliVideo,
 searchBilibiliVideos,
} from "@/lib/bilibili/api"
import {
 mapSearchItem,
 mapVideoData,
 parseBilibiliVideoRef,
} from "@/lib/bilibili/map"
import type { Track } from "@/lib/types"

type BilibiliMusicShelf = {
 id: string
 title: string
 tracks: Track[]
}

type BilibiliSearchItem = {
 typeid?: number
 typename?: string
 title?: string
}

const MUSIC_ROOT_RID =3
const MUSIC_RANK_RID =1003

const MUSIC_RANKING_SHELVES: {
 id: string
 title: string
 rid: number
}[] = [
 { id: "all-music", title: "全站音乐榜", rid: MUSIC_RANK_RID },
 { id: "music", title: "音乐区排行", rid: MUSIC_ROOT_RID },
 { id: "original", title: "原创音乐", rid:28 },
 { id: "cover", title: "翻唱", rid:31 },
 { id: "vocaloid", title: "VOCALOID·UTAU", rid:30 },
 { id: "performance", title: "演奏", rid:59 },
]

const MUSIC_SEARCH_TYPE_IDS = new Set([
3,28,31,30,59,193,29,130,243,244,265,266,267,1003,
])

const MUSIC_SEARCH_KEYWORDS = [
 "music",
 "mv",
 "vocaloid",
 "utau",
 "cover",
 "原创音乐",
 "翻唱",
 "演奏",
 "音乐",
 "音乐现场",
]

function isMusicSearchItem(item: BilibiliSearchItem): boolean {
 if (
 item.typeid != null &&
 MUSIC_SEARCH_TYPE_IDS.has(item.typeid)
 ) {
 return true
 }
 const text = `${item.typename ?? ""} ${item.title ?? ""}`.toLowerCase()
 return MUSIC_SEARCH_KEYWORDS.some((keyword) =>
 text.includes(keyword.toLowerCase()),
 )
}

async function searchBilibiliTracks(
 keyword: string,
 limit =30,
): Promise<Track[]> {
 const trimmed = keyword.trim()
 if (!trimmed) {
 return []
 }
 const direct = parseBilibiliVideoRef(trimmed)
 if (direct) {
 const track = mapVideoData(await fetchBilibiliVideo(direct))
 return track ? [track] : []
 }
 const items = await searchBilibiliVideos({
 keyword: trimmed,
 page:1,
 pageSize: limit,
 })
 return items
 .filter((item) => item.type === "video" || item.type == null)
 .map(mapSearchItem)
 .filter((track): track is Track => track != null)
}

async function fetchBilibiliPopularTracks(limit =24): Promise<Track[]> {
 const items = await fetchBilibiliPopularVideos({
 page:1,
 pageSize: Math.min(50, Math.max(1, limit)),
 })
 return items
 .filter((item) => item.type == null || item.type === "video")
 .filter(isMusicSearchItem)
 .map(mapSearchItem)
 .filter((track): track is Track => track != null)
}

async function searchBilibiliMusic(
 keyword: string,
 limit =30,
): Promise<Track[]> {
 const trimmed = keyword.trim()
 if (!trimmed) {
 return []
 }
 const direct = parseBilibiliVideoRef(trimmed)
 if (direct) {
 const track = mapVideoData(await fetchBilibiliVideo(direct))
 return track ? [track] : []
 }

 const [zoneItems, genericItems] = await Promise.all([
 searchBilibiliVideos({
 keyword: trimmed,
 page:1,
 pageSize: limit,
 tid: MUSIC_ROOT_RID,
 }),
 searchBilibiliVideos({
 keyword: trimmed,
 page:1,
 pageSize: limit,
 }),
 ])
 const merged = new Map<string, Track>()
 for (const item of zoneItems) {
 const track = mapSearchItem(item)
 if (track) {
 merged.set(track.id, track)
 }
 }
 for (const item of genericItems) {
 if (!isMusicSearchItem(item)) {
 continue
 }
 const track = mapSearchItem(item)
 if (track) {
 merged.set(track.id, track)
 }
 }
 return [...merged.values()].slice(0, limit)
}

async function fetchBilibiliMusicRanking(): Promise<
 BilibiliMusicShelf[]
> {
 const [popularResult, ...rankingResults] = await Promise.all([
 fetchBilibiliPopularTracks(8).catch(() => []),
 ...MUSIC_RANKING_SHELVES.map((definition) =>
 fetchRanking({ rid: definition.rid })
 .then((items) => items.slice(0,8))
 .catch(() => []),
 ),
 ])
 const shelves: BilibiliMusicShelf[] = []
 if (popularResult.length >0) {
 shelves.push({
 id: "popular",
 title: "热门音乐",
 tracks: popularResult,
 })
 }
 rankingResults.forEach((items, index) => {
 const definition = MUSIC_RANKING_SHELVES[index]
 if (!definition) {
 return
 }
 const tracks = items
 .map(mapSearchItem)
 .filter((track): track is Track => track != null)
 if (tracks.length >0) {
 shelves.push({
 id: definition.id,
 title: definition.title,
 tracks,
 })
 }
 })
 return shelves
}

export {
 fetchBilibiliMusicRanking,
 fetchBilibiliPopularTracks,
 searchBilibiliMusic,
 searchBilibiliTracks,
}
export type { BilibiliMusicShelf }
