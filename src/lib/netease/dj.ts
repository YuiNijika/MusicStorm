import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { mapNeteaseSongToTrack, type NeteaseSong } from "@/lib/netease/map-track"
import type { Radio, RadioProgram, Track } from "@/lib/types"

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
    desc?: string
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
    radio?: { id?: number; name?: string; picUrl?: string }
    dj?: { nickname?: string }
}

type DjProgramListData = {
    code?: number
    programs?: DjProgramRaw[]
    count?: number
}

type DjProgramDetailData = {
    code?: number
    program?: DjProgramRaw
    data?: DjProgramRaw
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

function programCover(program: DjProgramRaw): string {
    const cover =
        program.coverUrl ||
        program.coverImgUrl ||
        program.radio?.picUrl ||
        program.mainSong?.album?.picUrl ||
        ""
    return cover ? `${cover}?param=480y480` : ""
}

function mapProgramToTrack(
    program: DjProgramRaw,
    radioTitle?: string,
): Track | null {
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
        if (program.name?.trim()) {
            track.title = program.name.trim()
        }
        if (!track.coverUrl) {
            track.coverUrl = programCover(program)
        }
        if (radioTitle) {
            track.album = radioTitle
        }
        return track
    }

    return {
        id: String(songId),
        title: program.name?.trim() || "未知节目",
        artist: program.dj?.nickname || "播客",
        album: radioTitle || program.radio?.name || "电台",
        coverUrl: programCover(program),
        durationMs: program.duration ?? 0,
        source: "netease",
    }
}

function mapProgram(
    program: DjProgramRaw,
    fallbackRadioId?: string,
    fallbackRadioTitle?: string,
): RadioProgram | null {
    if (program.id == null) {
        return null
    }
    const track = mapProgramToTrack(
        program,
        fallbackRadioTitle || program.radio?.name,
    )
    if (!track) {
        return null
    }
    const radioId =
        program.radio?.id != null
            ? String(program.radio.id)
            : fallbackRadioId
    const coverUrl = programCover(program) || track.coverUrl
    const fallbackText =
        program.description?.trim() || program.desc?.trim() || undefined

    return {
        id: String(program.id),
        title: program.name?.trim() || track.title,
        coverUrl,
        description: fallbackText,
        durationMs: program.duration ?? track.durationMs,
        radioId,
        radioTitle: fallbackRadioTitle || program.radio?.name,
        djName: program.dj?.nickname,
        listenerCount: program.listenerCount,
        createTime: program.createTime,
        track: {
            ...track,
            coverUrl,
            lyricText: fallbackText,
            album: track.album || fallbackRadioTitle || program.radio?.name || "电台",
        },
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

async function fetchDjProgramList(
    rid: string,
    limit = 50,
    offset = 0,
): Promise<RadioProgram[]> {
    const data = await neteaseRequest<DjProgramListData>({
        path: NETEASE_PATHS.djProgram,
        params: { rid, limit, offset, asc: false },
    })
    const programs = data.programs ?? []
    return programs
        .map((item) => mapProgram(item, rid))
        .filter((item): item is RadioProgram => item != null)
}

/** @deprecated 用 fetchDjProgramList；保留曲目数组兼容 */
async function fetchDjPrograms(
    rid: string,
    limit = 50,
    offset = 0,
): Promise<Track[]> {
    const programs = await fetchDjProgramList(rid, limit, offset)
    return programs.map((item) => item.track)
}

async function fetchDjDetailWithPrograms(rid: string): Promise<{
    radio: Radio
    programs: RadioProgram[]
    tracks: Track[]
}> {
    const [radio, programs] = await Promise.all([
        fetchDjDetail(rid),
        fetchDjProgramList(rid, 50, 0),
    ])
    const withRadio = programs.map((item) => ({
        ...item,
        radioId: item.radioId || radio.id,
        radioTitle: item.radioTitle || radio.title,
        track: {
            ...item.track,
            album: item.track.album || radio.title,
        },
    }))
    return {
        radio,
        programs: withRadio,
        tracks: withRadio.map((item) => item.track),
    }
}

async function fetchDjProgramDetail(
    programId: string,
    radioId?: string,
): Promise<RadioProgram> {
    try {
        const data = await neteaseRequest<DjProgramDetailData>({
            path: NETEASE_PATHS.djProgramDetail,
            params: { id: programId },
            skipCache: false,
        })
        const raw = data.program ?? data.data
        if (raw) {
            const mapped = mapProgram(raw, radioId)
            if (mapped) {
                return mapped
            }
        }
    } catch {
        // 回落：从电台节目列表找
    }

    if (radioId) {
        const list = await fetchDjProgramList(radioId, 100, 0)
        const hit = list.find((item) => item.id === programId)
        if (hit) {
            return hit
        }
    }

    throw new Error("节目不存在或无法加载")
}

type DjSublistData = {
    code?: number
    count?: number
    djRadios?: DjRadioRaw[]
    data?: DjRadioRaw[]
}

/** 已订阅电台列表，需登录 */
async function fetchDjSublist(limit = 1000, offset = 0): Promise<Radio[]> {
    const data = await neteaseRequest<DjSublistData>({
        path: NETEASE_PATHS.djSublist,
        params: { limit, offset },
        skipCache: true,
    })
    const list = data.djRadios ?? data.data ?? []
    return list
        .map(mapRadio)
        .filter((item): item is Radio => item != null)
}

/** t=true 订阅 / false 取消 */
async function subscribeDjRadio(rid: string, subscribe: boolean): Promise<void> {
    const id = rid.trim()
    if (!/^\d+$/.test(id)) {
        throw new Error("无效电台 id")
    }
    await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.djSub,
        params: { rid: id, t: subscribe ? 1 : 0 },
        skipCache: true,
    })
}

export {
    fetchDjDetail,
    fetchDjDetailWithPrograms,
    fetchDjHot,
    fetchDjProgramDetail,
    fetchDjProgramList,
    fetchDjPrograms,
    fetchDjRecommend,
    fetchDjSublist,
    fetchHomeRadios,
    subscribeDjRadio,
}