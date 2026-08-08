/**
 * 本地音频后缀表，与 src-tauri AUDIO_EXTS 对齐。
 * 扫描可收录；能否解码由播放链路判定。
 */

const LOCAL_AUDIO_EXTS = [
    // 常用
    "mp3",
    "wav",
    "aac",
    "m4a",
    "flac",
    "ogg",
    "wma",
    // 无损与高保真
    "aif",
    "aiff",
    "ape",
    "alac",
    "wv",
    "dsf",
    "dff",
    "diff",
    "tta",
    // 有损
    "mp2",
    "mp1",
    "ra",
    "rm",
    "ram",
    "m4p",
    "opus",
    // 模块与合成
    "mid",
    "midi",
    "mod",
    "xm",
    "s3m",
    "it",
    // 其他
    "au",
    "voc",
    "cda",
    "amr",
    "gsm",
    "raw",
    "pcm",
    "mpga",
    "3gp",
    "3g2",
] as const

const LOCAL_AUDIO_EXT_SET = new Set<string>(LOCAL_AUDIO_EXTS)

/** 默认视为高音质或无损，用于 WASAPI auto */
const HIGH_QUALITY_EXTS = new Set([
    "flac",
    "wav",
    "aiff",
    "aif",
    "alac",
    "ape",
    "dsf",
    "dff",
    "diff",
    "wv",
    "tta",
    "pcm",
    "raw",
])

/** 当前 Symphonia 构建可直接解码的扩展名；其余本地格式需进入 FFmpeg 回退。 */
const NATIVE_DECODER_EXTS = new Set([
    "mp1",
    "mp2",
    "mp3",
    "mpga",
    "wav",
    "pcm",
    "raw",
    "aac",
    "m4a",
    "flac",
    "ogg",
    "aif",
    "aiff",
])

function extensionOf(pathOrName: string): string {
    const base = pathOrName.split(/[/\\]/).pop() ?? pathOrName
    const dot = base.lastIndexOf(".")
    if (dot <= 0) {
        return ""
    }
    return base.slice(dot + 1).toLowerCase()
}

function stripExtension(nameOrPath: string): string {
    const base = nameOrPath.split(/[/\\]/).pop() ?? nameOrPath
    const dot = base.lastIndexOf(".")
    if (dot <= 0) {
        return base
    }
    const ext = base.slice(dot + 1).toLowerCase()
    // 只剥音频后缀，避免误伤「艺人.歌名」
    if (LOCAL_AUDIO_EXT_SET.has(ext)) {
        return base.slice(0, dot)
    }
    return base
}

function isLocalAudioExt(ext: string): boolean {
    return LOCAL_AUDIO_EXT_SET.has(ext.trim().toLowerCase())
}

// 供统计归类
function fileStemFromPath(path: string | null | undefined): string | null {
    if (!path) {
        return null
    }
    const base = path.split(/[/\\]/).pop()?.trim()
    if (!base) {
        return null
    }
    const stem = stripExtension(base).trim()
    return stem || null
}

export {
    extensionOf,
    fileStemFromPath,
    HIGH_QUALITY_EXTS,
    isLocalAudioExt,
    LOCAL_AUDIO_EXTS,
    NATIVE_DECODER_EXTS,
    stripExtension,
}