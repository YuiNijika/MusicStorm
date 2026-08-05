import { apiCacheGet, apiCacheSet, withInflight } from "@/lib/netease/api-cache"
import {
    DEFAULT_BASE_URL,
    getApiSettings,
    getNeteaseBaseUrl,
} from "@/lib/netease/api-settings"
import { getNeteaseCookieParam } from "@/lib/netease/auth-cookie"
import { getApiCacheTtlMs } from "@/lib/netease/cache-prefs"
import { resolveRealIp } from "@/lib/netease/native/real-ip"
import { nativeNeteaseRequest } from "@/lib/netease/native/request"
import { NETEASE_PATHS } from "@/lib/netease/paths"

/**
 * 网易云请求入口
 * - integrated：应用内 TS 加密 + Tauri HTTP 代理，直连 music.163.com
 * - external：HTTP 对接官方、锦木祈杰或自定义 NCM API
 */

/** 不走磁盘缓存的路径：登录/写操作/时效 URL */
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
    const url = new URL(path, base.endsWith("/") ? base : `${base}/`)

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined) {
                continue
            }
            url.searchParams.set(key, String(value))
        }
    }

    if (!url.searchParams.has("realIP")) {
        url.searchParams.set("realIP", resolveRealIp())
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
            detail = errBody.msg?.trim() || errBody.message?.trim() || detail
        } catch {
            // 非 JSON 响应，保留 HTTP 状态码信息即可
        }
        throw new Error(`网易云接口失败: ${detail}`)
    }

    return (await response.json()) as T
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
                    const cached = JSON.parse(hit) as T
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

        return data
    }

    if (cacheable) {
        return withInflight(cacheKey, run)
    }
    return run()
}

export { DEFAULT_BASE_URL, getNeteaseBaseUrl, neteaseRequest, NETEASE_PATHS }