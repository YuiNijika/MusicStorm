import { useEffect, useState } from "react"

// 未认证 GitHub API 限额 60 次/小时，必须本地缓存；
// SWR：过期缓存先展示，后台静默刷新
const API_CONTRIBUTORS =
    "https://api.github.com/repos/YuiNijika/MusicStorm/contributors"
const CACHE_KEY = "musicstorm-github-contributors"
const CACHE_TTL_MS = 5 * 60 * 60 * 1000

type Contributor = {
    login: string
    avatarUrl: string
    htmlUrl: string
    contributions: number
}

type ContributorRaw = {
    login?: string
    avatar_url?: string
    html_url?: string
    contributions?: number
    type?: string
}

type CachePayload = {
    cachedAt: number
    contributors: Contributor[]
}

function readCache(): CachePayload | null {
    if (typeof window === "undefined") {
        return null
    }
    try {
        const raw = window.localStorage.getItem(CACHE_KEY)
        if (!raw) {
            return null
        }
        const parsed = JSON.parse(raw) as CachePayload
        if (
            typeof parsed.cachedAt !== "number" ||
            !Array.isArray(parsed.contributors)
        ) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

function writeCache(contributors: Contributor[]): void {
    try {
        window.localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ cachedAt: Date.now(), contributors }),
        )
    } catch {
        // 缓存写入失败不阻塞展示
    }
}

async function fetchContributors(): Promise<Contributor[]> {
    const response = await fetch(API_CONTRIBUTORS, {
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    })
    if (!response.ok) {
        throw new Error(`GitHub API HTTP ${response.status}`)
    }
    const data = (await response.json()) as ContributorRaw[]
    // 过滤 github-actions 等 bot 账号
    return data
        .filter((item) => item.type === "User" && item.login)
        .map((item) => ({
            login: item.login ?? "",
            avatarUrl: item.avatar_url ?? "",
            htmlUrl: item.html_url ?? "",
            contributions: item.contributions ?? 0,
        }))
}

function useContributors() {
    const [contributors, setContributors] = useState<Contributor[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function load() {
            const cached = readCache()
            if (cached && cancelled === false) {
                setContributors(cached.contributors)
                setLoading(false)
            }
            if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
                return
            }
            try {
                const fresh = await fetchContributors()
                writeCache(fresh)
                if (!cancelled) {
                    setContributors(fresh)
                }
            } catch {
                // 拉取失败保留缓存/空态，不打扰用户
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [])

    return { contributors, loading }
}

export { useContributors }
export type { Contributor }
