import {
 fetchBilibiliSeasonArchives,
 fetchBilibiliSeasonSeries,
 fetchBilibiliSeriesArchives,
 fetchBilibiliMusicRanking as fetchRanking,
 fetchBilibiliPopularVideos,
 fetchBilibiliUserCard,
 fetchBilibiliVideo,
 searchBilibiliVideos,
} from "@/lib/bilibili/api"
import {
 mapSearchItem,
 mapVideoData,
 normalizeImageUrl,
 parseBilibiliVideoRef,
} from "@/lib/bilibili/map"
import type { Track } from "@/lib/types"

type BilibiliMusicShelf = {
 id: string
 title: string
 tracks: Track[]
}

type BilibiliFeaturedUp = {
 id: string
 name: string
 avatarUrl: string
 description?: string
 fans?: number
 webUrl: string
}

type BilibiliFeaturedPlaylist = {
 id: string
 title: string
 coverUrl: string
 description?: string
 count?: number
 mid: number
 seasonId: number
 webUrl: string
}

type BilibiliUpCollectionKind = "season" | "series"

type BilibiliUpCollection = {
 id: string
 kind: BilibiliUpCollectionKind
 title: string
 coverUrl: string
 description?: string
 count?: number
 mid: number
 collectionId: number
 webUrl: string
}

type BilibiliCollectionKind = BilibiliUpCollectionKind

type BilibiliCollectionDetail = {
 mid: string
 collectionId: string
 kind: BilibiliCollectionKind
 title: string
 coverUrl: string
 description?: string
 count?: number
 webUrl: string
}

type BilibiliCollectionTracksPage = {
 tracks: Track[]
 page: number
 total?: number
 hasMore: boolean
}

type BilibiliUpProfile = {
 mid: string
 name: string
 avatarUrl: string
 description?: string
 fans?: number
 webUrl: string
 collections: BilibiliUpCollection[]
}

type BilibiliSearchItem = {
 typeid?: number
 typename?: string
    tid?: number
    tname?: string
 title?: string
}

const MUSIC_ROOT_RID =3
const MUSIC_RANK_RID =1003

const MUSIC_RANKING_SHELVES: {
 id: string
 title: string
 rid: number
}[] = [
 { id: "all-music", title: "全站音乐排行榜", rid: MUSIC_RANK_RID },
]

const FEATURED_UP_MIDS = [
607217518,296465852,1745584728,229733301,387522518,
1346923466,179264824,
] as const

const FEATURED_SHELF_LIMIT =16

const FEATURED_PLAYLIST_MID =296465852
const FEATURED_PLAYLIST_SEASONS = [2152368,2382541,2065308] as const

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
 const typeId = item.typeid ?? item.tid
 if (
 typeId != null &&
 MUSIC_SEARCH_TYPE_IDS.has(typeId)
 ) {
 return true
 }
 const text = `${item.typename ?? ""} ${item.tname ?? ""} ${item.title ?? ""}`.toLowerCase()
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
 const tracks = new Map<string, Track>()
 for (const item of items) {
 if (item.type != null && item.type !== "video") {
 continue
 }
 if (!isMusicSearchItem(item)) {
 continue
 }
 const track = mapSearchItem(item)
 if (!track) {
 continue
 }
 tracks.set(track.id, track)
 if (tracks.size >= limit) {
 break
 }
 }
 return [...tracks.values()]
}

async function fetchBilibiliFeaturedUps(): Promise<BilibiliFeaturedUp[]> {
 const results = await Promise.all(
 FEATURED_UP_MIDS.map((mid) =>
 fetchBilibiliUserCard(mid).catch(() => null),
 ),
 )
 return results.flatMap((card, index) => {
 if (!card) {
 return []
 }
 const mid = card.mid ?? FEATURED_UP_MIDS[index]
 if (!mid) {
 return []
 }
 return [{
 id: String(mid),
 name: card.name?.trim() || `UP ${mid}`,
 avatarUrl: card.face?.trim() || "",
 description: card.sign?.trim() || undefined,
 fans: card.fans,
 webUrl: `https://space.bilibili.com/${mid}`,
 }]
 })
}

async function fetchBilibiliFeaturedPlaylists(): Promise<
 BilibiliFeaturedPlaylist[]
> {
 const data = await fetchBilibiliSeasonSeries({
 mid: FEATURED_PLAYLIST_MID,
 page:1,
 pageSize:20,
 })
 const seasons = new Map<number, NonNullable<
 NonNullable<typeof data.items_lists>["seasons_list"]
 >[number]["meta"]>()
 for (const item of data.items_lists?.seasons_list ?? []) {
 const seasonId = item.meta?.season_id
 if (seasonId) {
 seasons.set(seasonId, item.meta)
 }
 }
 for (const item of data.items_lists?.series_list ?? []) {
 const seriesId = item.meta?.series_id
 if (seriesId) {
 seasons.set(seriesId, {
 ...item.meta,
 season_id: seriesId,
 })
 }
 }
 return FEATURED_PLAYLIST_SEASONS.flatMap((seasonId) => {
 const meta = seasons.get(seasonId)
 return [{
 id: `bilibili-season:${seasonId}`,
 title: meta?.name?.trim() || meta?.title?.trim() || `精选歌单 ${seasonId}`,
 coverUrl: normalizeImageUrl(meta?.cover) || "",
 description: meta?.description?.trim() || undefined,
 count: meta?.total,
 mid: FEATURED_PLAYLIST_MID,
 seasonId,
 webUrl:
 `https://space.bilibili.com/${FEATURED_PLAYLIST_MID}/lists/${seasonId}?type=season`,
 }]
 })
}

function mapBilibiliUpCollections(
 data: Awaited<ReturnType<typeof fetchBilibiliSeasonSeries>>,
 mid: number,
): BilibiliUpCollection[] {
 const seasons = (data.items_lists?.seasons_list ?? []).flatMap((item) => {
 const collectionId = item.meta?.season_id
 if (!collectionId) {
 return []
 }
 return [{
 id: `bilibili-season:${mid}:${collectionId}`,
 kind: "season" as const,
 title:
 item.meta?.name?.trim() ||
 item.meta?.title?.trim() ||
 `合集 ${collectionId}`,
 coverUrl: normalizeImageUrl(item.meta?.cover) || "",
 description: item.meta?.description?.trim() || undefined,
 count: item.meta?.total,
 mid,
 collectionId,
 webUrl: `https://space.bilibili.com/${mid}/lists/${collectionId}?type=season`,
 }]
 })
 const series = (data.items_lists?.series_list ?? []).flatMap((item) => {
 const collectionId = item.meta?.series_id
 if (!collectionId) {
 return []
 }
 return [{
 id: `bilibili-series:${mid}:${collectionId}`,
 kind: "series" as const,
 title:
 item.meta?.name?.trim() ||
 item.meta?.title?.trim() ||
 `系列 ${collectionId}`,
 coverUrl: normalizeImageUrl(item.meta?.cover) || "",
 description: undefined,
 count: item.meta?.total,
 mid,
 collectionId,
 webUrl: `https://space.bilibili.com/${mid}/lists/${collectionId}?type=series`,
 }]
 })
 return [...seasons, ...series]
}

async function fetchBilibiliUpProfile(mid: number): Promise<BilibiliUpProfile> {
 const [card, collectionData] = await Promise.all([
 fetchBilibiliUserCard(mid),
 fetchBilibiliSeasonSeries({
 mid,
 page:1,
 pageSize:20,
 }).catch(() => ({ items_lists: {} })),
 ])
 return {
 mid: String(card.mid ?? mid),
 name: card.name?.trim() || `UP ${mid}`,
 avatarUrl: normalizeImageUrl(card.face) || "",
 description: card.sign?.trim() || undefined,
 fans: card.fans,
 webUrl: `https://space.bilibili.com/${mid}`,
 collections: mapBilibiliUpCollections(collectionData, mid),
 }
}

function upCollectionToDetail(
 collection: BilibiliUpCollection,
): BilibiliCollectionDetail {
 return {
 mid: String(collection.mid),
 collectionId: String(collection.collectionId),
 kind: collection.kind,
 title: collection.title,
 coverUrl: collection.coverUrl,
 description: collection.description,
 count: collection.count,
 webUrl: collection.webUrl,
 }
}

async function fetchBilibiliCollectionDetail(input: {
 mid: number
 collectionId: number
 kind: BilibiliCollectionKind
}): Promise<BilibiliCollectionDetail> {
 const matched = await findBilibiliCollection(input)
 if (!matched) {
 throw new Error(
 input.kind === "series" ? "系列不存在或不可访问" : "合集不存在或不可访问",
 )
 }
 return upCollectionToDetail(matched)
}

async function findBilibiliCollection(input: {
 mid: number
 collectionId: number
 kind: BilibiliCollectionKind
}): Promise<BilibiliUpCollection | undefined> {
 const pageSize =20
 for (let page =1; page <=5; page +=1) {
 const data = await fetchBilibiliSeasonSeries({
 mid: input.mid,
 page,
 pageSize,
 })
 const matched = mapBilibiliUpCollections(data, input.mid).find(
 (item) =>
 item.kind === input.kind &&
 item.collectionId === input.collectionId,
 )
 if (matched) {
 return matched
 }
 const total = data.items_lists?.page?.total
 if (
 total == null ||
 page * pageSize >= total ||
 (data.items_lists?.seasons_list?.length ??0) +
 (data.items_lists?.series_list?.length ??0) ===
0
 ) {
 return undefined
 }
 }
 return undefined
}

async function fetchBilibiliCollectionTracksPage(input: {
 mid: number
 collectionId: number
 kind: BilibiliCollectionKind
 page?: number
 pageSize?: number
}): Promise<BilibiliCollectionTracksPage> {
 const page = Math.max(1, input.page ??1)
 const pageSize = Math.min(50, Math.max(1, input.pageSize ??20))
 const data =
 input.kind === "series"
 ? await fetchBilibiliSeriesArchives({
 mid: input.mid,
 seriesId: input.collectionId,
 page,
 pageSize,
 })
 : await fetchBilibiliSeasonArchives({
 mid: input.mid,
 seasonId: input.collectionId,
 page,
 pageSize,
 })
 const tracks = (data.archives ?? [])
 .map((item) =>
 mapSearchItem({
 bvid: item.bvid,
 aid: item.aid,
 title: item.title,
 pic: item.pic,
 duration: item.duration,
 author: item.author,
 }),
 )
 .filter((track): track is Track => track != null)
 const total = data.page?.total
 return {
 tracks,
 page,
 total,
 hasMore:
 tracks.length === pageSize &&
 (total == null || page * pageSize < total),
 }
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
 fetchBilibiliPopularTracks(24).catch(() => []),
 ...MUSIC_RANKING_SHELVES.map((definition) =>
 fetchRanking({ rid: definition.rid })
 .then((items) => items.slice(0,24))
 .catch(() => []),
 ),
 ])
 const rankingTracks = rankingResults.map((items) =>
 items
 .map(mapSearchItem)
 .filter((track): track is Track => track != null),
 )
 const musicRanking = rankingTracks[0] ?? []
 const popularTracks = new Map<string, Track>()
 for (const track of [...popularResult, ...musicRanking]) {
 popularTracks.set(track.id, track)
 if (popularTracks.size >=16) {
 break
 }
 }
 const shelves: BilibiliMusicShelf[] = []
 const popularItems = [...popularTracks.values()].slice(0,16)
 const popularIds = new Set(popularItems.map((track) => track.id))
 if (popularItems.length >0) {
 shelves.push({
 id: "popular",
 title: "热门音乐",
 tracks: popularItems,
 })
 }
 rankingTracks.forEach((items, index) => {
 const definition = MUSIC_RANKING_SHELVES[index]
 if (!definition) {
 return
 }
 const tracks = items
 .filter((track) => !popularIds.has(track.id))
 .slice(0, FEATURED_SHELF_LIMIT)
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
 fetchBilibiliFeaturedPlaylists,
 fetchBilibiliFeaturedUps,
 fetchBilibiliMusicRanking,
 fetchBilibiliPopularTracks,
 fetchBilibiliUpProfile,
 fetchBilibiliCollectionDetail,
 fetchBilibiliCollectionTracksPage,
 upCollectionToDetail,
 searchBilibiliMusic,
 searchBilibiliTracks,
}
export type {
 BilibiliFeaturedPlaylist,
 BilibiliFeaturedUp,
 BilibiliMusicShelf,
 BilibiliUpCollection,
 BilibiliUpCollectionKind,
 BilibiliCollectionDetail,
 BilibiliCollectionTracksPage,
 BilibiliUpProfile,
}
