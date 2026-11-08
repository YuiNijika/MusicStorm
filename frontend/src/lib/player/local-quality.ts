import { hasAndroidAudio } from "@/lib/android/native-bridge"
import {
    extensionOf,
    HIGH_QUALITY_EXTS,
    NATIVE_DECODER_EXTS,
} from "@/lib/local/audio-formats"
import { isAndroid } from "@/lib/platform"
import { isTauriRuntime } from "@/lib/player/native-bridge"
import type { EnginePref } from "@/lib/player/engine-policy"
import type { Track } from "@/lib/types"

// 无 bitrate 时普通有损不算高音质，避免 auto 误开原生引擎
function isHighQualityFile(track: Track, filePath: string): boolean {
    if (!filePath) {
        return false
    }

    const path = filePath
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

function isLocalHighQualityTrack(track: Track): boolean {
    if (track.source !== "local" || !track.filePath) {
        return false
    }
    return isHighQualityFile(track, track.filePath)
}

// 远程地址永不进 native（桌面用 H5）；auto 仅高音质
function shouldUseNativeForTrack(input: {
    track: Track
    pref: EnginePref
    filePath?: string
}): boolean {
    const { track, pref } = input
    const filePath = input.filePath ?? track.filePath
    if (pref === "html5" || !isTauriRuntime()) {
        return false
    }
    // Android：本地文件路径 + 网易云云端 URL 统吃——系统 MediaPlayer 可本地解码与 http 流式，
    // 后台/锁屏可靠（配合 Wake lock + 前台服务），不再退回 WebView H5
    if (isAndroid() && hasAndroidAudio()) {
        return true
    }
    if (!filePath || track.source === "netease") {
        return false
    }
    if (/^https?:\/\//i.test(filePath)) {
        return false
    }
    if (pref === "native") {
        return true
    }
    const extension = extensionOf(filePath)
    if (extension && !NATIVE_DECODER_EXTS.has(extension)) {
        return true
    }
    return isHighQualityFile(track, filePath)
}

export { isHighQualityFile, isLocalHighQualityTrack, shouldUseNativeForTrack }
