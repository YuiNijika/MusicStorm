import { invoke } from "@tauri-apps/api/core"

import {
 fetchBilibiliPlayData,
 fetchBilibiliVideo,
 type BilibiliAudioStream,
 type BilibiliDash,
 type BilibiliPlayData,
} from "@/lib/bilibili/api"
import type { Track } from "@/lib/types"
import { isWebMode } from "@/lib/web-mode"

type BilibiliAudioChoice = {
    urls: string[]
 audioId: number
 extension: "flac" | "m4a"
 bandwidth: number
}

type BilibiliAudioCache = {
 path: string
 reused: boolean
}

const AUDIO_PRIORITY = [30251,30250,30280,30232,30216]

function normalizeMediaUrl(value: string | undefined): string {
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

function normalizeMediaUrls(stream: BilibiliAudioStream): string[] {
    const values = [
        stream.baseUrl,
        stream.base_url,
        stream.backupUrl,
        stream.backup_url,
    ].flatMap((value) => (Array.isArray(value) ? value : [value]))
    return [
        ...new Set(
            values
                .map((value) => normalizeMediaUrl(value))
                .filter((value) => value.length > 0),
        ),
    ]
}

function toStreamList(
 value:
 | BilibiliAudioStream
 | BilibiliAudioStream[]
 | null
 | undefined,
): BilibiliAudioStream[] {
 if (!value) {
 return []
 }
 return Array.isArray(value) ? value : [value]
}

function flacStreams(value: BilibiliDash["flac"]): BilibiliAudioStream[] {
 if (!value) {
 return []
 }
 if (Array.isArray(value)) {
 return value
 }
 if ("audio" in value) {
 return toStreamList(value.audio)
 }
 return toStreamList(value as BilibiliAudioStream)
}

function flattenAudioCandidates(
 input: BilibiliPlayData,
): BilibiliAudioStream[] {
 const dash = input.dash
 if (!dash) {
 return []
 }
 return [
 ...flacStreams(dash.flac),
 ...toStreamList(dash.dolby?.audio),
 ...(dash.audio ?? []),
 ]
}

function pickAudioStream(input: {
 candidates: BilibiliAudioStream[]
}): BilibiliAudioChoice | null {
 const ranked = [...input.candidates].sort((a, b) => {
 const rank = (stream: BilibiliAudioStream) => {
 const id = stream.id ?? 0
 const priority = AUDIO_PRIORITY.indexOf(id)
 return priority === -1 ? AUDIO_PRIORITY.length : priority
 }
 return (
 rank(a) - rank(b) ||
 (b.bandwidth ?? 0) - (a.bandwidth ?? 0)
 )
 })
 for (const stream of ranked) {
        const urls = normalizeMediaUrls(stream)
        if (urls.length === 0) {
 continue
 }
 const audioId = stream.id ?? AUDIO_PRIORITY[0]!
 const mime = (stream.mimeType ?? stream.mime_type ?? "").toLowerCase()
 return {
            urls,
 audioId,
 extension:
 mime.includes("flac") || audioId === 30251
 ? "flac"
 : "m4a",
 bandwidth: stream.bandwidth ?? 0,
 }
 }
 return null
}

async function resolveBilibiliAudio(
 track: Track,
): Promise<{ path: string; track: Track }> {
 if (isWebMode()) {
 throw new Error("网页版暂不支持播放哔哩哔哩音频，请使用桌面版")
 }
 let resolvedTrack = track
 if (!resolvedTrack.cid) {
 const data = await fetchBilibiliVideo({
 bvid: track.bvid,
 aid: track.aid,
 })
 const cid = data.cid ?? data.pages?.[0]?.cid
 const bvid = data.bvid ?? track.bvid
 if (!cid || !bvid) {
 throw new Error("无法获取视频分集信息")
 }
 const pageDuration =
 data.pages && data.pages.length >1
 ? data.pages[0]?.duration
 : undefined
 resolvedTrack = {
 ...track,
 bvid,
 aid: data.aid ?? track.aid,
 cid,
 durationMs:
 track.durationMs ||
 (pageDuration ?? data.duration ??0) *1000,
 }
 }
 if (!resolvedTrack.bvid || !resolvedTrack.cid) {
 throw new Error("缺少视频编号，无法解析音频")
 }
 const playData = await fetchBilibiliPlayData({
 bvid: resolvedTrack.bvid,
 cid: resolvedTrack.cid,
 })
 const choice = pickAudioStream({
 candidates: flattenAudioCandidates(playData),
 })
 if (!choice) {
 throw new Error("此视频没有可用的音频流")
 }
    let cache: BilibiliAudioCache | null = null
    let lastError: unknown = null
    for (const url of choice.urls) {
        try {
            cache = await invoke<BilibiliAudioCache>(
                "bilibili_cache_audio",
                {
                    url,
                    bvid: resolvedTrack.bvid,
                    cid: resolvedTrack.cid,
                    audioId: choice.audioId,
                    extension: choice.extension,
                },
            )
            break
        } catch (error) {
            lastError = error
        }
    }
    if (!cache) {
        throw lastError instanceof Error
            ? lastError
            : new Error("哔哩哔哩音频暂时不可用")
    }
 return {
 path: cache.path,
 track: {
 ...resolvedTrack,
 coverUrl: resolvedTrack.coverUrl,
 audioId: choice.audioId,
 bitrateKbps:
 choice.bandwidth >0
 ? Math.round(choice.bandwidth /1000)
 : track.bitrateKbps,
 },
 }
}

export { flattenAudioCandidates, pickAudioStream, resolveBilibiliAudio }
