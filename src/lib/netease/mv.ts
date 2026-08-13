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

export type MvCard = {
    id: string
    title: string
    coverUrl: string
    artistName?: string
}

type MvSublistItem = {
    id?: number | string
    vid?: number | string
    imgurl16v9?: string
    cover?: string
    coverUrl?: string
    title?: string
    name?: string
    artistName?: string
    artistId?: number
    creator?: Array<{ userName?: string; userId?: number }>
}

type MvSublistData = {
    code?: number
    data?: MvSublistItem[] | { data?: MvSublistItem[] }
}

// 已收藏 MV 列表（需要登录）
async function fetchMvSublist(limit = 50): Promise<MvCard[]> {
    const data = await neteaseRequest<MvSublistData>({
        path: NETEASE_PATHS.mvSublist,
        params: { limit, offset: 0 },
        skipCache: true,
    })
    const raw = data.data
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray(raw.data)
          ? raw.data
          : []
    return list
        .filter((item) => (item.id ?? item.vid) != null)
        .map((item) => {
            const id = item.id ?? item.vid
            const cover = item.imgurl16v9 || item.cover || item.coverUrl || ""
            const artistName =
                item.artistName ||
                item.creator?.map((c) => c.userName).filter(Boolean).join(" / ") ||
                undefined
            return {
                id: String(id),
                title: (item.name ?? item.title)?.trim() || "未知 MV",
                coverUrl: cover ? `${cover}?param=720y405` : "",
                artistName,
            }
        })
}

async function subscribeMv(mvid: string, subscribe: boolean): Promise<void> {
    await neteaseRequest<{ code?: number }>({
        path: NETEASE_PATHS.mvSub,
        params: { mvid, id: mvid, t: subscribe ? 1 : 0 },
        skipCache: true,
    })
}

type SimiMvData = {
    code?: number
    mvs?: MvSublistItem[]
}

// 相似 MV 推荐
async function fetchSimiMvs(mvid: string): Promise<MvCard[]> {
    const data = await neteaseRequest<SimiMvData>({
        path: NETEASE_PATHS.simiMv,
        params: { mvid },
    })
    return (data.mvs ?? [])
        .filter((item) => (item.id ?? item.vid) != null)
        .map((item) => {
            const id = item.id ?? item.vid
            const cover = item.imgurl16v9 || item.cover || item.coverUrl || ""
            const artistName =
                item.artistName ||
                item.creator?.map((c) => c.userName).filter(Boolean).join(" / ") ||
                undefined
            return {
                id: String(id),
                title: (item.name ?? item.title)?.trim() || "未知 MV",
                coverUrl: cover ? `${cover}?param=720y405` : "",
                artistName,
            }
        })
}

export {
    fetchMvDetail,
    fetchMvPlayable,
    fetchMvSublist,
    fetchMvUrl,
    fetchSimiMvs,
    subscribeMv,
}