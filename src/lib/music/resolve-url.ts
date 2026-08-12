import { convertFileSrc } from "@tauri-apps/api/core"

import { getNeteaseQualityBr } from "@/lib/netease/quality"
import {
    describeSongUrlFailure,
    isSongUrlPlayable,
    pickRicherSongUrlEntry,
    type SongUrlItem,
} from "@/lib/netease/song-privilege"
import { fetchSongUrl } from "@/lib/netease/track"
import type { Track } from "@/lib/types"
import { isWebMode } from "@/lib/web-mode"

export type ResolvePlayableResult =
    | { ok: true; url: string }
    | { ok: false; reason: string; entry?: SongUrlItem }

/**
 * 网易云仍可能下发 HTTP CDN 地址。macOS WKWebView 会按 App Transport
 * Security 拒绝这类混合内容，而同一地址的 HTTPS 端点可直接使用。
 * 桌面版仅升级网易云域 126.net / 163.com，避免改写不确定支持 TLS 的第三方地址；
 * 网页版本身是 HTTPS 页面，任何 http 资源都会被浏览器拦截，一律升级尝试。
 */
function normalizeNeteaseMediaUrl(url: string): string {
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== "http:") {
            return url
        }
        const isNeteaseDomain =
            parsed.hostname === "126.net" ||
            parsed.hostname.endsWith(".126.net") ||
            parsed.hostname === "163.com" ||
            parsed.hostname.endsWith(".163.com")
        if (isNeteaseDomain || isWebMode()) {
            parsed.protocol = "https:"
            return parsed.toString()
        }
    } catch {
        // 保留原值，由音频引擎报告格式错误。
    }
    return url
}

// 本地直接 convertFileSrc；网易云始终重新取链，无 url / 无版权 / VIP 未购 → ok:false
async function resolvePlayableUrl(track: Track): Promise<ResolvePlayableResult> {
    if (track.filePath && track.source === "local") {
        // 网页版导入的本地歌 filePath 即 blob URL，可直接播放，无需 Tauri 转换
        if (isWebMode()) {
            return { ok: true, url: track.filePath }
        }
        try {
            return { ok: true, url: convertFileSrc(track.filePath) }
        } catch {
            return { ok: false, reason: "本地文件无法打开" }
        }
    }

    if (track.source === "netease") {
        if (!/^\d+$/.test(track.id)) {
            return { ok: false, reason: "无效的歌曲 id" }
        }

        const preferredBr = getNeteaseQualityBr()
        const tryOrder = [preferredBr, 320_000, 192_000, 128_000].filter(
            (br, index, list) => list.indexOf(br) === index,
        )

        let bestEntry: SongUrlItem | undefined

        for (const br of tryOrder) {
            try {
                const result = await fetchSongUrl(track.id, br)
                const entry = result.data?.[0]
                bestEntry = pickRicherSongUrlEntry(bestEntry, entry)
                if (isSongUrlPlayable(entry) && entry?.url) {
                    return {
                        ok: true,
                        url: normalizeNeteaseMediaUrl(entry.url),
                    }
                }
            } catch {
                // 尝试下一档
            }
        }

        return {
            ok: false,
            reason: describeSongUrlFailure(bestEntry),
            entry: bestEntry,
        }
    }

    if (track.url) {
        return { ok: true, url: normalizeNeteaseMediaUrl(track.url) }
    }

    if (track.filePath) {
        if (isWebMode()) {
            return { ok: true, url: track.filePath }
        }
        try {
            return { ok: true, url: convertFileSrc(track.filePath) }
        } catch {
            return { ok: false, reason: "本地文件无法打开" }
        }
    }

    return { ok: false, reason: "没有可用的播放地址" }
}

export { resolvePlayableUrl }
