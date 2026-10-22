import type {
    BilibiliSearchItem,
    BilibiliVideoData,
} from "@/lib/bilibili/api"
import type { Track } from "@/lib/types"

function parseDuration(value: string | number | undefined): number {
    if (typeof value === "number") {
        return Math.max(0, Math.round(value * 1000))
    }
    const text = value?.trim() ?? ""
    if (!text) {
        return 0
    }
    const parts = text.split(":").map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part))) {
        return 0
    }
    if (parts.length === 3) {
        return Math.round(
            (parts[0]! * 3600 + parts[1]! * 60 + parts[2]!) * 1000,
        )
    }
    if (parts.length === 2) {
        return Math.round((parts[0]! * 60 + parts[1]!) * 1000)
    }
    return Math.round((parts[0] ?? 0) * 1000)
}

function stripHtml(value: string): string {
    return value
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()
}

function normalizeImageUrl(value: string | undefined): string {
    if (!value) {
        return ""
    }
    if (value.startsWith("//")) {
        return `https:${value}`
    }
    if (value.startsWith("http://")) {
        return value.replace(/^http:\/\//, "https://")
    }
 return value
}

function pickImageUrl(...values: Array<string | undefined>): string {
 for (const value of values) {
 const normalized = normalizeImageUrl(value)
 if (normalized) {
 return normalized
 }
 }
 return ""
}

function bilibiliTrackId(bvid: string | undefined, aid: number | undefined): string {
    return `bilibili:${bvid ?? (aid != null ? `av${aid}` : "")}`
}

function mapSearchItem(item: BilibiliSearchItem): Track | null {
    const bvid = item.bvid?.trim()
    const aid = item.aid ?? item.id
    if (!bvid && aid == null) {
        return null
    }
    const id = bilibiliTrackId(bvid, aid)
    return {
        id,
        title: stripHtml(item.title ?? "") || "未命名视频",
        artist:
            item.author?.trim() ||
            item.owner?.name?.trim() ||
            "未知作者",
        album: item.typename?.trim() || "哔哩哔哩",
        tname: item.typename?.trim() || undefined,
 coverUrl: pickImageUrl(item.pic, item.cover, item.pic_url),
        durationMs: parseDuration(item.duration),
        source: "bilibili",
        viewCount: item.play ?? item.stat?.view,
        bvid: bvid || undefined,
        aid,
        webUrl: bvid
            ? `https://www.bilibili.com/video/${bvid}`
            : aid != null
              ? `https://www.bilibili.com/video/av${aid}`
              : undefined,
    }
}

function mapVideoData(data: BilibiliVideoData): Track | null {
    const bvid = data.bvid?.trim()
    const aid = data.aid
    if (!bvid && aid == null) {
        return null
    }
    const firstPage = data.pages?.[0]
    const cid = data.cid ?? firstPage?.cid
    const id = bilibiliTrackId(bvid, aid)
    return {
        id,
        title: stripHtml(data.title ?? "") || "未命名视频",
        artist: data.owner?.name?.trim() || "未知作者",
        album: "哔哩哔哩",
        tname: data.tname?.trim() || undefined,
 coverUrl: pickImageUrl(
 data.pic,
 data.cover,
 firstPage?.pic,
 ),
        durationMs: parseDuration(data.duration),
        source: "bilibili",
        viewCount: data.stat?.view,
        bvid: bvid || undefined,
        aid,
 cid,
        webUrl: bvid
            ? `https://www.bilibili.com/video/${bvid}`
            : aid != null
              ? `https://www.bilibili.com/video/av${aid}`
              : undefined,
    }
}

function parseBilibiliVideoRef(
    input: string,
): { bvid?: string; aid?: number } | null {
    const bvid = input.match(/BV[0-9A-Za-z]{10}/)?.[0]
    if (bvid) {
        return { bvid }
    }
    const aid = input.match(/(?:^|[^\w])av(\d+)/i)?.[1]
    if (aid) {
        return { aid: Number(aid) }
    }
    return null
}

export {
    mapSearchItem,
    mapVideoData,
    normalizeImageUrl,
    parseBilibiliVideoRef,
    parseDuration,
    stripHtml,
}
