import {
    apiCacheClear,
    apiCacheGet,
    apiCacheSet,
    withInflight,
} from "@/lib/netease/api-cache"
import {
    DEFAULT_BASE_URL,
    getApiSettings,
    getNeteaseBaseUrl,
} from "@/lib/netease/api-settings"
import { getNeteaseCookieParam } from "@/lib/netease/auth-cookie"
import { getApiCacheTtlMs } from "@/lib/netease/cache-prefs"
import {
    handleLoginFailure,
    isNeedLoginBody,
} from "@/lib/netease/session-guard"
import { resolveRealIp } from "@/lib/netease/native/real-ip"
import { nativeNeteaseRequest } from "@/lib/netease/native/request"
import { NETEASE_PATHS } from "@/lib/netease/paths"
import { upgradeNeteaseUrls } from "@/lib/music/upgrade-url"

// 网易云请求入口：integrated = TS 直连 music.163.com，external = 对接第三方 NCM API

// 不走磁盘缓存的路径：登录/写操作/时效 URL
const NO_CACHE_PATHS = new Set<string>([
    NETEASE_PATHS.songUrl,
    NETEASE_PATHS.loginQrKey,
    NETEASE_PATHS.loginQrCreate,
    NETEASE_PATHS.loginQrCheck,
    NETEASE_PATHS.captchaSent,
    NETEASE_PATHS.loginCellphone,
    NETEASE_PATHS.like,
    NETEASE_PATHS.playlistSubscribe,
    NETEASE_PATHS.playlistTracks,
])

// 写操作：成功后失效磁盘缓存，避免 playlistDetail / userPlaylist / sublist 等读接口命中旧数据
const WRITE_PATHS = new Set<string>([
    NETEASE_PATHS.like,
    NETEASE_PATHS.playlistSubscribe,
    NETEASE_PATHS.playlistCreate,
    NETEASE_PATHS.playlistUpdateName,
    NETEASE_PATHS.playlistDescUpdate,
    NETEASE_PATHS.playlistDelete,
    NETEASE_PATHS.playlistTracks,
    NETEASE_PATHS.albumSub,
    NETEASE_PATHS.artistSub,
    NETEASE_PATHS.mvSub,
    NETEASE_PATHS.djSub,
    NETEASE_PATHS.userCloudDel,
    NETEASE_PATHS.fmTrash,
    NETEASE_PATHS.comment,
])

type RequestOptions = {
    path: string
    params?: Record<string, string | number | boolean | undefined>
    query?: Record<string, string | number | boolean | undefined>
    method?: "GET" | "POST"
    skipCache?: boolean
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
    if (path === NETEASE_PATHS.loginQrCheck) {
        return
    }
    // 收藏/统计等隐私接口在凭证真失效时回需要登录码，这里识别并触发重新登录，
    // 因为资料接口常仍给 200，单看它会漏判
    if (isNeedLoginBody(body)) {
        handleLoginFailure()
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

async function fetchExternal<T>(
    path: string,
    method: string,
    params: Record<string, string | number | boolean | undefined> | undefined,
    cookie: string | null,
): Promise<T> {
    const base = getNeteaseBaseUrl()
    const baseUrl = base.endsWith("/") ? base : `${base}/`
    // path 以 / 开头会覆盖 base 的路径段（官方源带 /netease/music 子路径），
    // 去掉前导斜杠让 base 路径段生效；对无子路径的第三方源结果不变
    const url = new URL(path.replace(/^\/+/, ""), baseUrl)

    // realIP 和 cookie 始终走查询参数（PHP 端 $_GET 读取）
    if (!url.searchParams.has("realIP")) {
        url.searchParams.set("realIP", resolveRealIp())
    }
    if (cookie && !url.searchParams.has("cookie")) {
        url.searchParams.set("cookie", cookie)
    }

    // POST 请求把业务参数放入请求体（form-urlencoded），
    // 避免超长查询字符串被截断，同时兼容 $_POST 读取的 PHP 端
    const isPost = method.toUpperCase() === "POST"
    const bodyParams = isPost && params
        ? new URLSearchParams(
              Object.entries(params)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => [k, String(v)]),
          ).toString()
        : undefined

    // GET 请求把业务参数放查询参数
    if (!isPost && params) {
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined) {
                continue
            }
            url.searchParams.set(key, String(value))
        }
    }

    // 登录凭证经 URL cookie 参数透传（auth-cookie 体系），不依赖浏览器 cookie；
    // 必须 omit——credentials: include 会让 CORS 要求响应头返回具体 origin，
    // 与官方源/第三方源的 `Access-Control-Allow-Origin: *` 冲突而被浏览器拦截
    const fetchInit: RequestInit = {
        method,
        credentials: "omit",
    }
    if (isPost && bodyParams) {
        fetchInit.body = bodyParams
        fetchInit.headers = { "Content-Type": "application/x-www-form-urlencoded" }
    }

    const response = await fetch(url.toString(), fetchInit)

    if (!response.ok) {
        let detail = `HTTP ${response.status}`
        try {
            const errBody = (await response.json()) as {
                msg?: string
                message?: string
            }
            detail = errBody.msg?.trim() || errBody.message?.trim() || detail
        } catch {
            // 非 JSON 响应，保留 HTTP 状态码信息即可
        }
        throw new Error(`网易云接口失败: ${detail}`)
    }

    // 网易云封面仍是 http 地址，HTTPS 页面会按混合内容拒绝，这里统一升级后交给后续解包
    const json = upgradeNeteaseUrls(await response.json()) as T & {
        success?: boolean
        code?: number
        message?: string
        data?: unknown
        cookie?: string
    }

    // 官方源（CloudMusicAPI_New）返回统一 envelope { success, code, message, data, cookie? }：
    // - code 已是网易云业务码
    // - data 保留（登录接口 auth 层读 data.unikey / data.cookie 这类包裹形状，去掉会读不到）
    // - data 为对象时字段展平到顶层（lyric 读 lrc、likelist 读 ids 这类网易云原样形状）
    // 第三方源仍透传原始 JSON
    if (
        isOfficialSource(base) &&
        typeof json === "object" &&
        json !== null &&
        "success" in json
    ) {
        if (json.success !== true) {
            throw new Error(`网易云接口失败: ${json.message ?? "请求失败"}`)
        }
        const data = json.data
        const flattened: Record<string, unknown> = { code: json.code }
        if (data !== null && typeof data === "object" && !Array.isArray(data)) {
            Object.assign(flattened, data)
            flattened.data = data
        } else {
            flattened.data = data
        }
        if (json.cookie != null) {
            flattened.cookie = json.cookie
        }
        return flattened as T
    }

    return json as T
}

// 官方源判断：归一化去掉尾斜杠后与 DEFAULT_BASE_URL 比对
function isOfficialSource(base: string): boolean {
    return (
        base.replace(/\/+$/, "") === DEFAULT_BASE_URL.replace(/\/+$/, "")
    )
}

async function neteaseRequest<T>(options: RequestOptions): Promise<T> {
    const settings = getApiSettings()
    const method = options.method ?? "GET"
    const cookieParam = getNeteaseCookieParam() ?? null
    const params = mergeParams(options.params, options.query)
    const checkCode = options.checkCode !== false
    const modeKey =
        settings.mode === "integrated"
            ? "native"
            : getNeteaseBaseUrl()
    const cacheable = !options.skipCache && shouldCache(options.path, method)
    const cacheKey = cacheable
        ? buildCacheKey(modeKey, options.path, params, cookieParam)
        : ""

    const run = async (): Promise<T> => {
        if (cacheable) {
            const hit = await apiCacheGet(cacheKey)
            if (hit) {
                try {
                    // 旧缓存里可能还是 http 封面，命中时同样升级
                    const cached = upgradeNeteaseUrls(JSON.parse(hit)) as T
                    if (checkCode) {
                        assertNeteasePayload(options.path, cached)
                    }
                    return cached
                } catch {
                    // 缓存损坏时忽略并回源请求
                }
            }
        }

        let data: T
        if (settings.mode === "integrated") {
            data = await nativeNeteaseRequest<T>(options.path, params ?? {})
        } else {
            data = await fetchExternal<T>(
                options.path,
                method,
                params,
                cookieParam,
            )
        }

        if (checkCode) {
            assertNeteasePayload(options.path, data)
        }

        if (cacheable) {
            const ttl = getApiCacheTtlMs()
            void apiCacheSet(cacheKey, JSON.stringify(data), ttl)
        }

        // 写操作成功后失效缓存：这些请求本身不落缓存，但会改变 playlistDetail /
        // userPlaylist / sublist 等读接口的结果，立即清掉避免旧数据一直命中
        if (WRITE_PATHS.has(options.path)) {
            void apiCacheClear()
        }

        return data
    }

    if (cacheable) {
        return withInflight(cacheKey, run)
    }
    return run()
}

export { DEFAULT_BASE_URL, getNeteaseBaseUrl, neteaseRequest, NETEASE_PATHS }