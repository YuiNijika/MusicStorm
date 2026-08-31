import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { parseLyricText, type LyricLine } from "@/lib/lyric/parse"

type LyricApiData = {
    lrc?: { lyric?: string }
    tlyric?: { lyric?: string }
    code?: number
}

function toNeteaseSongId(songId: string): string | null {
    // 网易云曲目 id 为纯数字
    return /^\d+$/.test(songId) ? songId : null
}

async function fetchLyricText(songId: string): Promise<string> {
    const numericId = toNeteaseSongId(songId)
    if (!numericId) {
        return ""
    }

    const data = await neteaseRequest<LyricApiData>({
        path: NETEASE_PATHS.lyric,
        params: { id: numericId },
    })

    return data.lrc?.lyric?.trim() ?? ""
}

/** 原文行与翻译行按时间戳就近配对（容差内），每行最多配一句翻译 */
function mergeTranslatedLyrics(
    lrc: LyricLine[],
    tlyric: LyricLine[],
    toleranceMs = 100,
): LyricLine[] {
    const translation = tlyric
        .filter((line) => line.timeMs > 0 && Boolean(line.text.trim()))
        .sort((a, b) => a.timeMs - b.timeMs)
    if (translation.length === 0) {
        return lrc
    }
    return lrc.map((line) => {
        if (line.timeMs <= 0) {
            return line
        }
        let best: LyricLine | null = null
        let bestDelta = toleranceMs + 1
        for (const item of translation) {
            const delta = Math.abs(item.timeMs - line.timeMs)
            if (delta < bestDelta) {
                bestDelta = delta
                best = item
            }
            if (item.timeMs > line.timeMs + toleranceMs) {
                break
            }
        }
        return best ? { ...line, translation: best.text } : line
    })
}

async function fetchLyricLines(
    songId: string,
    includeTranslation = true,
): Promise<LyricLine[]> {
    const numericId = toNeteaseSongId(songId)
    if (!numericId) {
        return []
    }

    const data = await neteaseRequest<LyricApiData>({
        path: NETEASE_PATHS.lyric,
        params: { id: numericId },
    })

    const lrcText = data.lrc?.lyric?.trim() ?? ""
    const tlyricText = data.tlyric?.lyric?.trim() ?? ""
    const lines = parseLyricText(lrcText)
    if (!includeTranslation || lines.length === 0) {
        return lines
    }
    const translated = parseLyricText(tlyricText)

    // 无时间戳歌词（纯文本）：无法按时间配对，退化为按行序配对
    const untimed = lines.every((line) => line.timeMs <= 0)
    if (untimed) {
        if (
            translated.length > 0 &&
            translated.every((line) => line.timeMs <= 0) &&
            translated.length === lines.length
        ) {
            return lines.map((line, index) => ({
                ...line,
                translation: translated[index].text,
            }))
        }
        return lines
    }

    return mergeTranslatedLyrics(lines, translated)
}

export { fetchLyricLines, fetchLyricText, mergeTranslatedLyrics }