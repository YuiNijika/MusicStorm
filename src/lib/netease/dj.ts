import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Radio, Track } from "@/lib/types"

type DjRadioRaw = {
    id?: number
    name?: string
    picUrl?: string
    desc?: string
    programCount?: number
    category?: string
    dj?: { nickname?: string; brand?: string }
    lastProgramName?: string
}

type DjListData = {
    code?: number
    djRadios?: DjRadioRaw[]
    data?: DjRadioRaw[]
}

type DjDetailData = {
    code?: number
    data?: DjRadioRaw & {
        id?: number
        name?: string
        picUrl?: string
        desc?: string
        programCount?: number
    }
    djRadio?: DjRadioRaw
}

type DjProgramRaw = {
    id?: number
    name?: string
    coverUrl?: string
    coverImgUrl?: string
    description?: string
    duration?: number
    createTime?: number
    listenerCount?: number
    mainSong?: NeteaseSong & {
        id?: number
        name?: string
        duration?: number
        album?: { picUrl?: string; name?: string }
        artists?: { name?: string }[]
    }
    radio?: { name?: string; picUrl?: string }
    dj?: { nickname?: string }
}

type DjProgramListData = {
    code?: number
    programs?: DjProgramRaw[]
    count?: number
}

function mapRadio(item: DjRadioRaw): Radio | null {
    if (item.id == null) {
        return null
    }
    const cover = item.picUrl ? `${item.picUrl}?param=480y480` : ""
    return {
        id: String(item.id),
        title: item.name?.trim() || "未知电台",
        coverUrl: cover,
        description: item.desc?.trim() || item.lastProgramName,
        programCount: item.programCount,
        djName: item.dj?.nickname || item.dj?.brand,
        category: item.category,
    }
}

async function fetchDjRecommend(limit = 12): Promise<Radio[]> {
    const data = await neteaseRequest<DjListData>({
        path: NETEASE_PATHS.djRecommend,
        params: { limit },
    })
    const list = data.djRadios ?? data.data ?? []
    return list
        .map(mapRadio)
        .filter((item): item is Radio => item != null)
        .slice(0, limit)
}

async function fetchDjHot(limit = 24, offset = 0): Promise<Radio[]> {
    const data = await neteaseRequest<DjListData>({
        path: NETEASE_PATHS.djHot,
        params: { limit, offset },
    })
    const list = data.djRadios ?? data.data ?? []
    return list
        .map(mapRadio)
        .filter((item): item is Radio => item != null)
}

/** 首页：精选优先，不足用热门补齐 */
async function fetchHomeRadios(limit = 18): Promise<Radio[]> {
    try {
        const recommend = await fetchDjRecommend(limit)
        if (recommend.length >= Math.min(8, limit)) {
            return recommend.slice(0, limit)
        }
        const hot = await fetchDjHot(limit)
        const seen = new Set(recommend.map((item) => item.id))
        const merged = [...recommend]
        for (const item of hot) {
            if (seen.has(item.id)) {
                continue
            }
            merged.push(item)
            if (merged.length >= limit) {
                break
            }
        }
        return merged
    } catch {
        return fetchDjHot(limit)
    }
}

async function fetchDjDetail(rid: string): Promise<Radio> {
    const data = await neteaseRequest<DjDetailData>({
        path: NETEASE_PATHS.djDetail,
        params: { rid },
    })
    const raw = data.data ?? data.djRadio
    if (!raw) {
        throw new Error("电台不存在")
    }
    const mapped = mapRadio({ ...raw, id: raw.id ?? Number(rid) })
    if (!mapped) {
        throw new Error("电台数据无效")
    }
    return mapped
}

function mapProgramToTrack(program: DjProgramRaw, radioTitle?: string): Track | null {
    const main = program.mainSong
    const songId = main?.id ?? program.id
    if (songId == null) {
        return null
    }

    if (main && main.name) {
        const track = mapNeteaseSongToTrack({
            ...main,
            id: Number(main.id ?? songId),
            name: main.name,
            dt: main.dt ?? main.duration ?? program.duration,
        })
        // 节目名优先
        if (program.name?.trim()) {
            track.title = program.name.trim()
        }
        if (!track.coverUrl) {
            const cover =
                program.coverUrl ||
                program.coverImgUrl ||
                program.radio?.picUrl ||
                main.album?.picUrl
            track.coverUrl = cover ? `${cover}?param=400y400` : ""
        }
        if (radioTitle) {
            track.album = radioTitle
        }
        return track
    }

    const cover =
        program.coverUrl || program.coverImgUrl || program.radio?.picUrl || ""
    return {
        id: String(songId),
        title: program.name?.trim() || "未知节目",
        artist: program.dj?.nickname || "播客",
        album: radioTitle || program.radio?.name || "电台",
        coverUrl: cover ? `${cover}?param=400y400` : "",
        durationMs: program.duration ?? 0,
        source: "netease",
    }
}

async function fetchDjPrograms(
    rid: string,
    limit = 50,
    offset = 0,
): Promise<Track[]> {
    const data = await neteaseRequest<DjProgramListData>({
        path: NETEASE_PATHS.djProgram,
        params: { rid, limit, offset, asc: false },
    })
    const programs = data.programs ?? []
    return programs
        .map((item) => mapProgramToTrack(item))
        .filter((item): item is Track => item != null)
}

async function fetchDjDetailWithPrograms(rid: string): Promise<{
    radio: Radio
    tracks: Track[]
}> {
    const [radio, tracks] = await Promise.all([
        fetchDjDetail(rid),
        fetchDjPrograms(rid, 50, 0),
    ])
    // 补专辑名为电台名
    const withAlbum = tracks.map((track) => ({
        ...track,
        album: track.album || radio.title,
    }))
    return { radio, tracks: withAlbum }
}

export {
    fetchDjDetail,
    fetchDjDetailWithPrograms,
    fetchDjHot,
    fetchDjPrograms,
    fetchDjRecommend,
    fetchHomeRadios,
}