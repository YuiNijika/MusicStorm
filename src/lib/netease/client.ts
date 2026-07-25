import { getNeteaseCookieParam } from "@/lib/netease/auth-cookie"
import { apiCacheGet, apiCacheSet, withInflight } from "@/lib/netease/api-cache"
import { getApiCacheTtlMs } from "@/lib/netease/cache-prefs"

/**
 * 网易云 API 路径约定
 * - 服务实现：项目内 CloudMusicAPI（NeteaseCloudMusicApi）
 * - 客户端调用形态：对齐 YesPlayMusic/src/api/*
 */
export const NETEASE_PATHS = {
    songUrl: "/song/url",
    songDetail: "/song/detail",
    lyric: "/lyric",
    search: "/cloudsearch",
    playlistDetail: "/playlist/detail",
    playlistSubscribe: "/playlist/subscribe",
    personalized: "/personalized",
    recommendSongs: "/recommend/songs",
    loginQrKey: "/login/qr/key",
    loginQrCreate: "/login/qr/create",
    loginQrCheck: "/login/qr/check",
    captchaSent: "/captcha/sent",
    loginCellphone: "/login/cellphone",
    userAccount: "/user/account",
    userPlaylist: "/user/playlist",
    likelist: "/likelist",
    like: "/like",
    artists: "/artists",
    artistAlbum: "/artist/album",
    artistMv: "/artist/mv",
    artistDesc: "/artist/desc",
    simiArtist: "/simi/artist",
    album: "/album",
    /** 播客 / 电台 */
    djHot: "/dj/hot",
    djRecommend: "/dj/recommend",
    djDetail: "/dj/detail",
    djProgram: "/dj/program",
} as const

const BASE_URL_KEY = "musicstorm-netease-base-url"
const DEFAULT_BASE_URL = "https://cloud-music-api.miomoe.cn"

/** 不走磁盘缓存的路径（登录/写操作/时效 URL） */
const NO_CACHE_PATHS = new Set<string>([
    NETEASE_PATHS.songUrl,
    NETEASE_PATHS.loginQrKey,
    NETEASE_PATHS.loginQrCreate,
    NETEASE_PATHS.loginQrCheck,
    NETEASE_PATHS.captchaSent,
    NETEASE_PATHS.loginCellphone,
    NETEASE_PATHS.like,
    NETEASE_PATHS.playlistSubscribe,
])

function getNeteaseBaseUrl(): string {
    if (typeof window === "undefined") {
        return DEFAULT_BASE_URL
    }
    return window.localStorage.getItem(BASE_URL_KEY) || DEFAULT_BASE_URL
}

function setNeteaseBaseUrl(url: string): void {
    window.localStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ""))
}

type RequestOptions = {
    path: string
    params?: Record<string, string | number | boolean | undefined>
    /** 兼容旧写法；与 params 合并，params 优先 */
    query?: Record<string, string | number | boolean | undefined>
    method?: "GET" | "POST"
    /** 强制跳过缓存 */
    skipCache?: boolean
    /**
     * 是否校验 body.code（默认 true）。
     * 扫码轮询等「code 即状态」接口应关闭。
     */
    checkCode?: boolean
}

function mergeParams(
    params?: Record<string, string | number | boolean | undefined>,
    query?: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> | undefined {
    if (!params && !query) {
        return undefined
    }
    return { ...(query ?? {}), ...(params ?? {}) }
}

/** 网易云 body.code：200 成功；登录扫码 800–803 为状态码而非错误 */
function assertNeteasePayload(path: string, data: unknown): void {
    if (!data || typeof data !== "object") {
        return
    }
    const body = data as {
        code?: number
        msg?: string
        message?: string
    }
    if (body.code == null) {
        return
    }
    if (body.code === 200) {
        return
    }
    // 扫码轮询：800 过期 / 801 待扫 / 802 已扫 / 803 成功
    if (path === NETEASE_PATHS.loginQrCheck) {
        return
    }
    const detail =
        body.msg?.trim() ||
        body.message?.trim() ||
        `接口错误 code=${body.code}`
    throw new Error(detail)
}

function buildCacheKey(
    base: string,
    path: string,
    params: Record<string, string | number | boolean | undefined> | undefined,
    cookie: string | null,
): string {
    const sorted = Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("&")
    // cookie 指纹：登录态不同缓存隔离；不落完整 cookie
    const cookieFp = cookie ? String(hashString(cookie)) : "guest"
    return `netease|${base}|${path}|${sorted}|${cookieFp}`
}

function hashString(input: string): number {
    let h = 2166136261
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

function shouldCache(path: string, method: string): boolean {
    if (method !== "GET") {
        return false
    }
    if (NO_CACHE_PATHS.has(path)) {
        return false
    }
    return getApiCacheTtlMs() > 0
}

async function neteaseRequest<T>(options: RequestOptions): Promise<T> {
    const base = getNeteaseBaseUrl()
    const method = options.method ?? "GET"
    const cookie = getNeteaseCookieParam()
    const params = mergeParams(options.params, options.query)
    const checkCode = options.checkCode !== false
    const cacheable = !options.skipCache && shouldCache(options.path, method)
    const cacheKey = cacheable
        ? buildCacheKey(base, options.path, params, cookie)
        : ""

    const run = async (): Promise<T> => {
        if (cacheable) {
            const hit = await apiCacheGet(cacheKey)
            if (hit) {
                try {
                    const cached = JSON.parse(hit) as T
                    if (checkCode) {
                        assertNeteasePayload(options.path, cached)
                    }
                    return cached
                } catch {
                    // 坏缓存 / 旧错误缓存忽略
                }
            }
        }

        const url = new URL(options.path, base.endsWith("/") ? base : `${base}/`)

        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value === undefined) {
                    continue
                }
                url.searchParams.set(key, String(value))
            }
        }

        if (!url.searchParams.has("realIP")) {
            url.searchParams.set("realIP", "211.161.244.70")
        }
        if (cookie && !url.searchParams.has("cookie")) {
            url.searchParams.set("cookie", cookie)
        }

        const response = await fetch(url.toString(), {
            method,
            credentials: "include",
        })

        if (!response.ok) {
            let detail = `HTTP ${response.status}`
            try {
                const errBody = (await response.json()) as {
                    msg?: string
                    message?: string
                }
                detail =
                    errBody.msg?.trim() ||
                    errBody.message?.trim() ||
                    detail
            } catch {
                // ignore parse
            }
            throw new Error(`网易云接口失败: ${detail}`)
        }

        const data = (await response.json()) as T
        if (checkCode) {
            assertNeteasePayload(options.path, data)
        }

        if (cacheable) {
            const ttl = getApiCacheTtlMs()
            void apiCacheSet(cacheKey, JSON.stringify(data), ttl)
        }

        return data
    }

    if (cacheable) {
        return withInflight(cacheKey, run)
    }
    return run()
}

export {
    DEFAULT_BASE_URL,
    getNeteaseBaseUrl,
    neteaseRequest,
    setNeteaseBaseUrl,
    BASE_URL_KEY,
}