import { convertFileSrc } from "@tauri-apps/api/core"

import { getNeteaseQualityBr } from "@/lib/netease/quality"
import { fetchSongUrl } from "@/lib/netease/track"
import type { Track } from "@/lib/types"

/**
 * 解析可播放 URL。
 * - 本地 filePath：convertFileSrc → asset 协议
 * - netease：始终重新取链（会话里缓存的 CDN url 会过期）
 * - 其它已有 url：直接用
 */
async function resolvePlayableUrl(track: Track): Promise<string | null> {
    if (track.filePath && track.source === "local") {
        try {
            return convertFileSrc(track.filePath)
        } catch {
            return null
        }
    }

    if (track.source === "netease") {
        if (!/^\d+$/.test(track.id)) {
            return null
        }

        const preferredBr = getNeteaseQualityBr()
        const tryOrder = [preferredBr, 320_000, 192_000, 128_000].filter(
            (br, index, list) => list.indexOf(br) === index,
        )

        for (const br of tryOrder) {
            try {
                const result = await fetchSongUrl(track.id, br)
                const url = result.data?.[0]?.url
                if (url) {
                    return url
                }
            } catch {
                // 尝试下一档
            }
        }

        return null
    }

    if (track.url) {
        return track.url
    }

    if (track.filePath) {
        try {
            return convertFileSrc(track.filePath)
        } catch {
            return null
        }
    }

    return null
}

export { resolvePlayableUrl }