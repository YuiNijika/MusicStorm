import {
    extensionOf,
    HIGH_QUALITY_EXTS,
    NATIVE_DECODER_EXTS,
} from "@/lib/local/audio-formats"
import { isTauriRuntime } from "@/lib/player/native-bridge"
import type { EnginePref } from "@/lib/player/engine-policy"
import type { Track } from "@/lib/types"

// 无 bitrate 时普通有损不算高音质，避免 auto 误开原生引擎
function isLocalHighQualityTrack(track: Track): boolean {
    if (track.source !== "local" || !track.filePath) {
        return false
    }

    const path = track.filePath
    const ext = extensionOf(path)

    if (HIGH_QUALITY_EXTS.has(ext)) {
        return true
    }

    // m4a 可能是 ALAC，路径含 alac 时弱启发
    if ((ext === "m4a" || ext === "mp4" || ext === "alac") && /alac/i.test(path)) {
        return true
    }

    if (
        ext === "mp3" &&
        typeof track.bitrateKbps === "number" &&
        track.bitrateKbps >= 320
    ) {
        return true
    }

    return false
}

// 远程地址永不进 native；auto 仅高音质
function shouldUseNativeForTrack(track: Track, pref: EnginePref): boolean {
    if (pref === "html5" || !isTauriRuntime()) {
        return false
    }
    if (!track.filePath || track.source === "netease") {
        return false
    }
    if (/^https?:\/\//i.test(track.filePath)) {
        return false
    }
    if (pref === "native") {
        return true
    }
    const extension = extensionOf(track.filePath)
    if (extension && !NATIVE_DECODER_EXTS.has(extension)) {
        return true
    }
    return isLocalHighQualityTrack(track)
}

export { isLocalHighQualityTrack, shouldUseNativeForTrack }
