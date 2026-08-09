const OWNER = "YuiNijika"
const REPO = "MusicStorm"
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`

// 未认证请求限额 60 次/小时/IP，短缓存避免反复触发
const CACHE_TTL_MS = 5 * 60 * 1000

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

interface CacheEnvelope<T> {
    at: number
    data: T
}

function readCache<T>(key: string): T | null {
    try {
        const raw = sessionStorage.getItem(key)
        if (!raw) {
            return null
        }
        const parsed = JSON.parse(raw) as CacheEnvelope<T>
        if (Date.now() - parsed.at > CACHE_TTL_MS) {
            return null
        }
        return parsed.data
    } catch {
        // sessionStorage 可能被禁用（隐私模式），静默回退到网络请求
        return null
    }
}

function writeCache<T>(key: string, data: T): void {
    try {
        const envelope: CacheEnvelope<T> = { at: Date.now(), data }
        sessionStorage.setItem(key, JSON.stringify(envelope))
    } catch {
        // 同上，缓存失败不影响主流程
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

/** 最新桌面版：Android 版本线走独立 -android 后缀 tag，官网下载按钮只认桌面版 */
async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
    const cacheKey = "musicstorm-web.latest-release"
    const cached = readCache<ReleaseInfo>(cacheKey)
    if (cached) {
        return cached
    }

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
    writeCache(cacheKey, info)
    return info
}

async function fetchContributors(): Promise<Contributor[]> {
    const cacheKey = "musicstorm-web.contributors"
    const cached = readCache<Contributor[]>(cacheKey)
    if (cached) {
        return cached
    }

    const list = await fetchJson<
        { login: string; avatar_url: string; html_url: string; type: string }[]
    >(`${API_BASE}/contributors?per_page=30`)
    if (!list) {
        return []
    }

    // 过滤 bot 账号，只展示真人贡献者
    const contributors = list
        .filter((c) => c.type === "User")
        .map((c) => ({
            login: c.login,
            avatarUrl: c.avatar_url,
            profileUrl: c.html_url,
        }))
    writeCache(cacheKey, contributors)
    return contributors
}

export { REPO_URL, RELEASES_URL, LICENSE_URL, fetchLatestRelease, fetchContributors }
export type { ReleaseInfo, Contributor }
