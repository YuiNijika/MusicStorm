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

export type ResolvePlayableResult =
    | { ok: true; url: string }
    | { ok: false; reason: string; entry?: SongUrlItem }

// 本地直接 convertFileSrc；网易云始终重新取链，无 url / 无版权 / VIP 未购 → ok:false
async function resolvePlayableUrl(track: Track): Promise<ResolvePlayableResult> {
    if (track.filePath && track.source === "local") {
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
                    return { ok: true, url: entry.url }
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
        return { ok: true, url: track.url }
    }

    if (track.filePath) {
        try {
            return { ok: true, url: convertFileSrc(track.filePath) }
        } catch {
            return { ok: false, reason: "本地文件无法打开" }
        }
    }

    return { ok: false, reason: "没有可用的播放地址" }
}

export { resolvePlayableUrl }