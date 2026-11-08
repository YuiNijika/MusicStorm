// 必应每日壁纸：内置拉取 + 本地缓存一天（本地时区自然日），供背景功能复用。
// 优先走 server-api 中转（外置源 CORS 干净），失败回退直连官方 HPImageArchive。

const CACHE_KEY = "musicstorm-bing-wallpaper"
const FETCH_TIMEOUT_MS = 8000

type BingCache = {
    day: string
    url: string
    copyright?: string
}

function dayKey(ts = Date.now()): string {
    const date = new Date(ts)
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

function readCache(): BingCache | null {
    try {
        const raw = window.localStorage.getItem(CACHE_KEY)
        const data = raw ? (JSON.parse(raw) as BingCache) : null
        return data && data.url && data.day === dayKey() ? data : null
    } catch {
        return null
    }
}

function writeCache(data: BingCache): void {
    try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
        // 存储不可用仅影响本次，不阻塞
    }
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(url, { signal })
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
}

// server-api 外置源：独立壁纸接口 {host}/wallpaper/bing（便于后续扩展更多壁纸类型）
async function fetchViaProxy(base: string): Promise<BingCache> {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
        // 壁纸接口挂 API 源根（如 api.miomoe.cn/wallpaper/bing），与 netease 子路径解耦
        let root = base
        try {
            root = new URL(base).origin
        } catch {
            // 非绝对地址则原样拼接，交给上层回退直连
        }
        const data = (await fetchJson(
            `${root.replace(/\/+$/, "")}/wallpaper/bing`,
            controller.signal,
        )) as {
            data?: { url?: string; copyright?: string }
            url?: string
            copyright?: string
        }
        // server-api 走 { success, code, message, data:{url} } 包裹，兼容裸返回
        const url = data.data?.url ?? data.url
        if (!url) {
            throw new Error("代理未返回壁纸")
        }
        return {
            day: dayKey(),
            url,
            copyright: data.data?.copyright ?? data.copyright,
        }
    } finally {
        window.clearTimeout(timer)
    }
}

// 统一走 api.miomoe.cn：客户端不直连必应官方接口（跨域/不可达），全部经 server-api 代理
async function fetchBingWallpaper(
    proxyBase: string,
): Promise<BingCache | null> {
    const cached = readCache()
    if (cached) {
        return cached
    }
    try {
        const viaProxy = await fetchViaProxy(proxyBase)
        writeCache(viaProxy)
        return viaProxy
    } catch {
        return null
    }
}

export { fetchBingWallpaper }
export type { BingCache }