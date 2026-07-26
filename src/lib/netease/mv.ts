import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"

export type MvProfile = {
    id: string
    title: string
    coverUrl: string
    artistName: string
    artistId?: string
    durationMs: number
    playCount?: number
    description?: string
    publishTime?: string
}

export type MvPlayable = {
    profile: MvProfile
    /** 可播放直链，无版权或地区限制时为空 */
    url: string | null
    br?: number
}

type MvDetailData = {
    code?: number
    data?: {
        id?: number
        name?: string
        cover?: string
        imgurl?: string
        artistName?: string
        artistId?: number
        artists?: { id?: number; name?: string }[]
        duration?: number
        playCount?: number
        desc?: string
        publishTime?: string
    }
}

type MvUrlData = {
    code?: number
    data?: {
        id?: number
        url?: string | null
        r?: number
        br?: number
    }
}

async function fetchMvDetail(mvId: string): Promise<MvProfile> {
    const id = mvId.trim()
    if (!/^\d+$/.test(id)) {
        throw new Error("无效 MV id")
    }
    const data = await neteaseRequest<MvDetailData>({
        path: NETEASE_PATHS.mvDetail,
        params: { mvid: id, id },
    })
    const raw = data.data
    if (!raw) {
        throw new Error("MV 不存在")
    }
    const artists = raw.artists ?? []
    const primary = artists[0]
    const artistName =
        artists
            .map((item) => item.name)
            .filter(Boolean)
            .join(" / ") ||
        raw.artistName ||
        "未知艺人"
    const cover = raw.cover || raw.imgurl || ""
    return {
        id,
        title: raw.name?.trim() || "未知 MV",
        coverUrl: cover ? `${cover}?param=720y405` : "",
        artistName,
        artistId:
            primary?.id != null
                ? String(primary.id)
                : raw.artistId != null
                  ? String(raw.artistId)
                  : undefined,
        durationMs: raw.duration ?? 0,
        playCount: raw.playCount,
        description: raw.desc?.trim() || undefined,
        publishTime: raw.publishTime,
    }
}

async function fetchMvUrl(mvId: string, r = 1080): Promise<{ url: string | null; br?: number }> {
    const id = mvId.trim()
    if (!/^\d+$/.test(id)) {
        throw new Error("无效 MV id")
    }
    // 从高到低尝试清晰度
    const tryOrder = [r, 1080, 720, 480, 240].filter(
        (value, index, list) => list.indexOf(value) === index,
    )
    for (const quality of tryOrder) {
        try {
            const data = await neteaseRequest<MvUrlData>({
                path: NETEASE_PATHS.mvUrl,
                params: { id, r: quality },
                skipCache: quality !== tryOrder[0],
            })
            const url = data.data?.url?.trim() || null
            if (url) {
                return { url, br: data.data?.br ?? data.data?.r ?? quality }
            }
        } catch {
            // 下一档
        }
    }
    return { url: null }
}

async function fetchMvPlayable(mvId: string): Promise<MvPlayable> {
    const [profile, play] = await Promise.all([
        fetchMvDetail(mvId),
        fetchMvUrl(mvId),
    ])
    return {
        profile,
        url: play.url,
        br: play.br,
    }
}

export { fetchMvDetail, fetchMvPlayable, fetchMvUrl }