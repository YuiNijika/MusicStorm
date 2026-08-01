import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { parseLrc, type LyricLine } from "@/lib/lyric/parse"

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

async function fetchLyricLines(songId: string): Promise<LyricLine[]> {
    return parseLrc(await fetchLyricText(songId))
}

export { fetchLyricLines, fetchLyricText }