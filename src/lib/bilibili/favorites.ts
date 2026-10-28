import { bilibiliRequest } from "@/lib/bilibili/client"
import type { Track } from "@/lib/types"

type FavoriteFolderRaw = {
 id?: number
 fid?: number
 media_id?: number
 mid?: number
 title?: string
 media_count?: number
 cover?: string
 pic?: string
 pic_url?: string
 intro?: string
 attr?: number
}

type FavoriteFoldersData = {
 list?: FavoriteFolderRaw[] | null
 items?: FavoriteFolderRaw[] | null
}

type FavoriteFolderInfoRaw = FavoriteFolderRaw & {
 cover?: string
}

type FavoriteResourceRaw = {
 id?: number
 bvid?: string
 title?: string
 cover?: string
 pic?: string
 pic_url?: string
 duration?: number
 type?: number
 upper?: { name?: string }
 cnt_info?: { play?: number; collect?: number }
}

type FavoriteItemsData = {
 info?: {
 id?: number
 title?: string
 media_count?: number
 cover?: string
 intro?: string
 }
 medias?: FavoriteResourceRaw[] | null
 has_more?: boolean
}

export type BilibiliFavoriteFolder = {
 id: string
 title: string
 coverUrl: string
 description?: string
 count: number
 isPublic: boolean
}

export type BilibiliFavoritePage = {
 folder: BilibiliFavoriteFolder
 tracks: Track[]
 hasMore: boolean
}

const PAGE_SIZE =20
const MAX_FOLDER_PAGE_SIZE =20
const FOLDER_LIST_LIMIT =100
const FOLDER_PAGE_SIZE =100
const MUSIC_TYPE_ID =12

function normalizeUrl(value: string | undefined): string {
 if (!value) {
 return ""
 }
 if (value.startsWith("//")) {
 return `https:${value}`
 }
 if (value.startsWith("http://")) {
 return value.replace(/^http:\/\//, "https://")
 }
 try {
 const url = new URL(value)
 if (
 url.hostname.endsWith(".hdslb.com") ||
 url.hostname.endsWith(".bilibili.com")
 ) {
 url.search = ""
 return url.toString()
 }
 } catch {
 return value
 }
 return value
}

function stripHtml(value: string): string {
 return value
 .replace(/<[^>]+>/g, "")
 .replace(/&amp;/g, "&")
 .replace(/&quot;/g, '"')
 .replace(/&#39;/g, "'")
 .trim()
}

function mapFolder(item: FavoriteFolderRaw): BilibiliFavoriteFolder | null {
 const id = item.id ?? item.fid ?? item.media_id
 if (!id) {
 return null
 }
 return {
 id: String(id),
 title: item.title?.trim() || "未命名收藏夹",
 coverUrl: normalizeUrl(item.cover ?? item.pic ?? item.pic_url),
 description: item.intro?.trim() || undefined,
 count: item.media_count ??0,
 isPublic: (item.attr ??0) ===0,
 }
}

function mapTrack(item: FavoriteResourceRaw): Track | null {
 const bvid = item.bvid?.trim()
 const aid = item.id
 if (!bvid && !aid) {
 return null
 }
 const id = bvid ?? `av${aid}`
 return {
 id: `bilibili:${id}`,
 title: stripHtml(item.title ?? "") || "未命名音频",
 artist: item.upper?.name?.trim() || "未知作者",
 album: "哔哩哔哩",
 coverUrl: normalizeUrl(item.cover ?? item.pic ?? item.pic_url),
 durationMs: Math.max(0, item.duration ??0) *1000,
 source: "bilibili",
 bvid: bvid || undefined,
 aid,
 viewCount: item.cnt_info?.play ?? item.cnt_info?.collect,
 webUrl: bvid
 ? `https://www.bilibili.com/video/${bvid}`
 : aid
 ? `https://www.bilibili.com/video/av${aid}`
 : undefined,
 }
}

async function fetchBilibiliFavoriteFolders(
 mid: number,
): Promise<BilibiliFavoriteFolder[]> {
 const allFolders = await bilibiliRequest<FavoriteFoldersData | null>({
 path: "/x/v3/fav/folder/created/list-all",
 params: {
 up_mid: mid,
 type:2,
 },
 wbi: false,
 })
 let rawFolders = allFolders?.list ?? allFolders?.items
 if (!Array.isArray(rawFolders) || rawFolders.length ===0) {
 const page = await bilibiliRequest<FavoriteFoldersData | null>({
 path: "/x/v3/fav/folder/created/list",
 params: {
 pn:1,
 ps:FOLDER_PAGE_SIZE,
 up_mid: mid,
 },
 wbi: false,
 })
 rawFolders = page?.list ?? page?.items
 }
 if (!Array.isArray(rawFolders)) {
 return []
 }

 const limitedFolders = rawFolders.slice(0, FOLDER_LIST_LIMIT)
 const detailedFolders = await Promise.all(
 limitedFolders.map(async (raw) => {
 const mapped = mapFolder(raw)
 if (!mapped) {
 return null
 }
 try {
 const detail = await bilibiliRequest<FavoriteFolderInfoRaw | null>({
 path: "/x/v3/fav/folder/info",
 params: {
 media_id: mapped.id,
 },
 wbi: false,
 })
 const coverUrl = normalizeUrl(detail?.cover)
 return coverUrl ? { ...mapped, coverUrl } : mapped
 } catch {
 return mapped
 }
 }),
 )
 return detailedFolders.filter(
 (item): item is BilibiliFavoriteFolder => item != null,
 )
}

async function fetchBilibiliFavoritePage(input: {
 mediaId: string
 page?: number
}): Promise<BilibiliFavoritePage> {
 const page = Math.max(1, input.page ??1)
 const data = await bilibiliRequest<FavoriteItemsData | null>({
 path: "/x/v3/fav/resource/list",
 params: {
 media_id: input.mediaId,
 pn: page,
 ps: PAGE_SIZE,
 order: "mtime",
 type:0,
 tid:0,
 platform: "web",
 },
 wbi: false,
 })
 const folder: BilibiliFavoriteFolder = {
 id: String(data?.info?.id ?? input.mediaId),
 title: data?.info?.title?.trim() || "收藏夹",
 coverUrl: normalizeUrl(
 data?.info?.cover ??
 data?.medias?.[0]?.cover ??
 data?.medias?.[0]?.pic,
 ),
 description: data?.info?.intro?.trim() || undefined,
 count: data?.info?.media_count ??0,
 isPublic: true,
 }
 const tracks = (data?.medias ?? [])
 .filter(
 (item) =>
 item.type == null ||
 item.type === MUSIC_TYPE_ID ||
 item.type ===2,
 )
 .map(mapTrack)
 .filter((track): track is Track => track != null)
 if (!folder.coverUrl) {
 folder.coverUrl = tracks[0]?.coverUrl ?? ""
 }
 return {
 folder,
 tracks,
 hasMore: Boolean(data?.has_more),
 }
}

async function loadAllBilibiliFavoriteTracks(
 mediaId: string,
): Promise<Track[]> {
 const tracks: Track[] = []
 let page =1
 while (true) {
 const result = await fetchBilibiliFavoritePage({ mediaId, page })
 tracks.push(...result.tracks)
 if (!result.hasMore || page >= MAX_FOLDER_PAGE_SIZE) {
 break
 }
 page +=1
 }
 return tracks
}

export {
 PAGE_SIZE as BILIBILI_FAVORITE_PAGE_SIZE,
 fetchBilibiliFavoriteFolders,
 fetchBilibiliFavoritePage,
 loadAllBilibiliFavoriteTracks,
}
