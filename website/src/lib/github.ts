const OWNER = "YuiNijika"
const REPO = "MusicStorm"
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`

// 未认证请求限额 60 次/小时/IP；localStorage 持久缓存 1 小时，跨会话命中
const CACHE_TTL_MS = 60 * 60 * 1000

const REPO_URL = `https://github.com/${OWNER}/${REPO}`
const RELEASES_URL = `${REPO_URL}/releases`
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`

interface ReleaseInfo {
    version: string
    url: string
}

interface Contributor {
    login: string
    avatarUrl: string
    profileUrl: string
}

interface SwrResult<T> {
    cached: T | null
    refreshed: Promise<T | null>
}

interface CacheEnvelope<T> {
    at: number
    data: T
}

function readCache<T>(key: string): CacheEnvelope<T> | null {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) {
            return null
        }
        return JSON.parse(raw) as CacheEnvelope<T>
    } catch {
        // 隐私模式禁用 localStorage 时静默退化为无缓存
        return null
    }
}

function writeCache<T>(key: string, data: T): void {
    try {
        const envelope: CacheEnvelope<T> = { at: Date.now(), data }
        localStorage.setItem(key, JSON.stringify(envelope))
    } catch {
        // 缓存失败不影响主流程
    }
}

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, {
            headers: { Accept: "application/vnd.github+json" },
        })
        if (!res.ok) {
            return null
        }
        return (await res.json()) as T
    } catch {
        // 离线或限流时区块整体降级隐藏，不阻塞页面
        return null
    }
}

async function requestLatestRelease(): Promise<ReleaseInfo | null> {
    const releases = await fetchJson<{ tag_name: string; html_url: string }[]>(
        `${API_BASE}/releases?per_page=20`,
    )
    const desktop = releases?.find((r) => !r.tag_name.endsWith("-android"))
    if (!desktop) {
        return null
    }

    const info: ReleaseInfo = {
        version: desktop.tag_name.replace(/^v/, ""),
        url: desktop.html_url,
    }
    writeCache(CACHE_KEY_RELEASE, info)
    return info
}

async function requestContributors(): Promise<Contributor[] | null> {
    const list = await fetchJson<
        { login: string; avatar_url: string; html_url: string; type: string }[]
    >(`${API_BASE}/contributors?per_page=30`)
    if (!list) {
        return null
    }

    // 过滤 bot 账号，只展示真人贡献者
    const contributors = list
        .filter((c) => c.type === "User")
        .map((c) => ({
            login: c.login,
            avatarUrl: c.avatar_url,
            profileUrl: c.html_url,
        }))
    writeCache(CACHE_KEY_CONTRIBUTORS, contributors)
    return contributors
}

const CACHE_KEY_RELEASE = "musicstorm-web.latest-release"
const CACHE_KEY_CONTRIBUTORS = "musicstorm-web.contributors"

function swr<T>(cacheKey: string, request: () => Promise<T | null>): SwrResult<T> {
    const cached = readCache<T>(cacheKey)
    // 新鲜缓存直接命中，不再回源
    if (cached && Date.now() - cached.at <= CACHE_TTL_MS) {
        return { cached: cached.data, refreshed: Promise.resolve(cached.data) }
    }
    return { cached: cached?.data ?? null, refreshed: request() }
}

function loadLatestRelease(): SwrResult<ReleaseInfo> {
    return swr(CACHE_KEY_RELEASE, requestLatestRelease)
}

function loadContributors(): SwrResult<Contributor[]> {
    return swr(CACHE_KEY_CONTRIBUTORS, requestContributors)
}

export {
    REPO_URL,
    RELEASES_URL,
    LICENSE_URL,
    loadLatestRelease,
    loadContributors,
}
export type { ReleaseInfo, Contributor, SwrResult }
