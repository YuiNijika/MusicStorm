/** 本地高音质判定与 WASAPI 路由 */

import { isTauriRuntime } from "@/lib/player/native-bridge"
import type { EnginePref } from "@/lib/player/engine-policy"
import type { Track } from "@/lib/types"

/** 默认视为高音质 / 无损容器 */
const HIGH_QUALITY_EXTS = new Set([
    "flac",
    "wav",
    "aiff",
    "aif",
    "alac",
    "ape",
    "dsf",
    "dff",
    "wv",
])

function extensionOf(pathOrName: string): string {
    const base = pathOrName.split(/[/\\]/).pop() ?? pathOrName
    const dot = base.lastIndexOf(".")
    if (dot < 0) {
        return ""
    }
    return base.slice(dot + 1).toLowerCase()
}

/**
 * 本地高音质：无损扩展名，或 mp3/m4a 带足够码率元数据。
 * 无 bitrate 字段时普通有损（mp3 等）不算高音质。
 */
function isLocalHighQualityTrack(track: Track): boolean {
    if (track.source !== "local" || !track.filePath) {
        return false
    }

    const path = track.filePath
    const ext = extensionOf(path)

    if (HIGH_QUALITY_EXTS.has(ext)) {
        return true
    }

    // m4a/mp4 文件名含 alac 的弱启发
    if ((ext === "m4a" || ext === "mp4") && /alac/i.test(path)) {
        return true
    }

    // V1.1：有码率时 mp3 ≥ 320 也进 WASAPI
    if (ext === "mp3" && typeof track.bitrateKbps === "number" && track.bitrateKbps >= 320) {
        return true
    }

    return false
}

/**
 * 是否应对该曲尝试 WASAPI。
 * - html5：否
 * - wasapi：凡本地 filePath（远程仍否）
 * - auto：仅本地高音质
 */
function shouldUseWasapiForTrack(track: Track, pref: EnginePref): boolean {
    if (pref === "html5" || !isTauriRuntime()) {
        return false
    }
    if (!track.filePath || track.source === "netease") {
        return false
    }
    // 远程 http(s) 路径禁止进 native
    if (/^https?:\/\//i.test(track.filePath)) {
        return false
    }
    if (pref === "wasapi") {
        return true
    }
    // auto
    return isLocalHighQualityTrack(track)
}

export { isLocalHighQualityTrack, shouldUseWasapiForTrack }