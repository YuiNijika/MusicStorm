import { GITHUB_REPO_URL } from "@/lib/open-external"
import { resolveUpdateUrl } from "@/lib/app/update-source-prefs"
import { isAndroid } from "@/lib/platform"
import { isWebMode } from "@/lib/web-mode"

const OWNER = "YuiNijika"
const REPO = "MusicStorm"
const CACHE_TTL_MS = 5 * 60 * 60 * 1000
const STATUS_EVENT = "musicstorm:update-status"
const API_RELEASES = `https://api.github.com/repos/${OWNER}/${REPO}/releases`

// GitHub 匿名 API 额度受限时会回 403（直连与镜像都可能出现），
// 线性退避后重试，最多 5 次
const MAX_403_RETRIES = 5

async function fetchGithubReleases(currentVersion: string): Promise<Response> {
    const target = resolveUpdateUrl(API_RELEASES)
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        // GitHub 要求有意义的 UA
        "User-Agent": `MusicStorm/${currentVersion}`,
    }
    let lastError: Error | null = null
    for (let attempt = 0; attempt < MAX_403_RETRIES; attempt += 1) {
        if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
        }
        try {
            const response = await fetch(target, { method: "GET", headers })
            if (response.status !== 403) {
                return response
            }
            lastError = new Error(`GitHub API HTTP 403（已重试 ${attempt + 1} 次）`)
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error("检查更新失败")
        }
    }
    throw lastError ?? new Error("GitHub API 请求失败")
}

// 桌面与安卓各自发版：桌面用正式 tag，安卓用「版本号-android」独立 tag（如 26.9.5-android）
const RELEASE_CACHE_KEY = "musicstorm-github-release-cache"

type GithubReleaseRaw = {
    tag_name?: string
    name?: string | null
    body?: string | null
    html_url?: string
    prerelease?: boolean
    draft?: boolean
    published_at?: string | null
}

type UpdateCheckResult = {
    /** 应用当前版本（semver） */
    currentVersion: string
    /** 最新 tag 原文，如 v0.2.0 */
    latestTag: string
    /** 最新版本（已去 v） */
    latestVersion: string
    /** Release 标题 */
    releaseName: string
    /** Markdown / 纯文本说明 */
    releaseBody: string
    /** 浏览器打开用 */
    htmlUrl: string
    publishedAt: string | null
    hasUpdate: boolean
    /** 是否命中本地缓存 */
    fromCache: boolean
    checkedAt: number
    /** 拉取失败时的说明（仍可能有旧缓存） */
    error?: string
}

type CachePayload = {
    checkedAt: number
    currentVersion: string
    latestTag: string
    latestVersion: string
    releaseName: string
    releaseBody: string
    htmlUrl: string
    publishedAt: string | null
    hasUpdate: boolean
}

function normalizeSemver(raw: string): string | null {
    const cleaned = raw.trim().replace(/^v/i, "")
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned)
    if (!match) {
        return null
    }
    return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`
}

function readInjectedBuildVersion(): string | null {
    const raw =
        (typeof __APP_BUILD_VERSION__ === "string"
            ? __APP_BUILD_VERSION__
            : import.meta.env.VITE_APP_VERSION) ?? ""
    const version = raw.trim()
    return version ? version : null
}

function parseSemverTuple(raw: string): [number, number, number] | null {
    const normalized = normalizeSemver(raw)
    if (!normalized) {
        return null
    }
    const [a, b, c] = normalized.split(".").map((n) => Number(n))
    if (![a, b, c].every((n) => Number.isFinite(n))) {
        return null
    }
    return [a, b, c]
}

function isNewerVersion(latest: string, current: string): boolean {
    const a = parseSemverTuple(latest)
    const b = parseSemverTuple(current)
    if (!a || !b) {
        return false
    }
    for (let i = 0; i < 3; i += 1) {
        if (a[i] > b[i]) {
            return true
        }
        if (a[i] < b[i]) {
            return false
        }
    }
    return false
}

async function readAppVersion(): Promise<string> {
    // 桌面与 Android 共用 tauri.conf.json 的版本：getVersion() 在桌面返回桌面版、
    // 在 Android 返回 versionName（= 同一语义版本），跨平台一致。
    const injected = readInjectedBuildVersion()
    try {
        const { getVersion } = await import("@tauri-apps/api/app")
        const v = await getVersion()
        const normalized = normalizeSemver(v)
        if (normalized) {
            return normalized
        }
    } catch {
        // 浏览器预览：走注入版本或固定占位，仅开发用
    }
    if (injected) {
        return normalizeSemver(injected) ?? injected
    }
    return "0.1.0"
}

function readCache(): CachePayload | null {
    if (typeof window === "undefined") {
        return null
    }
    try {
        const raw = window.localStorage.getItem(RELEASE_CACHE_KEY)
        if (!raw) {
            return null
        }
        const parsed = JSON.parse(raw) as CachePayload
        if (
            typeof parsed.checkedAt !== "number" ||
            typeof parsed.latestVersion !== "string" ||
            typeof parsed.currentVersion !== "string"
        ) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

function writeCache(payload: CachePayload): void {
    try {
        window.localStorage.setItem(
            RELEASE_CACHE_KEY,
            JSON.stringify(payload),
        )
    } catch {
        // 缓存写入失败不阻塞更新检查
    }
}

function cacheToResult(cache: CachePayload, fromCache: boolean): UpdateCheckResult {
    return {
        currentVersion: cache.currentVersion,
        latestTag: cache.latestTag,
        latestVersion: cache.latestVersion,
        releaseName: cache.releaseName,
        releaseBody: cache.releaseBody,
        htmlUrl: cache.htmlUrl,
        publishedAt: cache.publishedAt,
        hasUpdate: cache.hasUpdate,
        fromCache,
        checkedAt: cache.checkedAt,
    }
}

function emitStatus(result: UpdateCheckResult): void {
    if (typeof window === "undefined") {
        return
    }
    window.dispatchEvent(
        new CustomEvent<UpdateCheckResult>(STATUS_EVENT, { detail: result }),
    )
}

function isCacheFresh(cache: CachePayload, now = Date.now()): boolean {
    return now - cache.checkedAt < CACHE_TTL_MS
}

async function checkAppUpdate(force = false): Promise<UpdateCheckResult> {
    // 网页版是线上最新代码，无本地版本可比较，也不做应用内更新
    if (isWebMode()) {
        return {
            currentVersion: "0.0.0",
            latestTag: "",
            latestVersion: "",
            releaseName: "",
            releaseBody: "",
            htmlUrl: "",
            publishedAt: null,
            hasUpdate: false,
            fromCache: false,
            checkedAt: Date.now(),
        }
    }
    const currentVersion = await readAppVersion()
    const cached = readCache()
    const now = Date.now()

    if (!force && cached && isCacheFresh(cached)) {
        // 本地版本可能已升级：按当前版本重算 hasUpdate
        const hasUpdate = isNewerVersion(cached.latestVersion, currentVersion)
        const result = cacheToResult(
            { ...cached, currentVersion, hasUpdate },
            true,
        )
        emitStatus(result)
        return result
    }

    try {
        const response = await fetchGithubReleases(currentVersion)

        if (!response.ok) {
            throw new Error(`GitHub API HTTP ${response.status}`)
        }

        const all = (await response.json()) as GithubReleaseRaw[]
        // 按平台匹配 tag，不排除 prerelease：同版本桌面与安卓常同时发布，
        // 其中一方可能标为预发布，过滤掉会找不到本平台版本而回退老版本
        const androidPlatform = isAndroid()
        const data = all.find((r) => {
            if (r.draft) {
                return false
            }
            const tag = (r.tag_name ?? "").trim()
            if (!tag) {
                return false
            }
            return androidPlatform ? /-android$/i.test(tag) : true
        })
        if (!data) {
            throw new Error("当前平台暂无发布版本")
        }

        const latestTag = (data.tag_name ?? "").trim()
        const latestVersion = normalizeSemver(latestTag)
        if (!latestVersion) {
            throw new Error(`无法解析版本号: ${latestTag || "(空)"}`)
        }

        const htmlUrl = resolveUpdateUrl(
            data.html_url?.trim() ||
                `${GITHUB_REPO_URL}/releases/tag/${encodeURIComponent(latestTag)}`,
        )
        const releaseName = (data.name ?? "").trim() || latestTag
        const releaseBody = (data.body ?? "").trim()
        const publishedAt = data.published_at ?? null
        const hasUpdate = isNewerVersion(latestVersion, currentVersion)
        const checkedAt = Date.now()

        const payload: CachePayload = {
            checkedAt,
            currentVersion,
            latestTag,
            latestVersion,
            releaseName,
            releaseBody,
            htmlUrl,
            publishedAt,
            hasUpdate,
        }
        writeCache(payload)

        const result = cacheToResult(payload, false)
        emitStatus(result)
        return result
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "检查更新失败"

        if (cached) {
            const hasUpdate = isNewerVersion(cached.latestVersion, currentVersion)
            const result: UpdateCheckResult = {
                ...cacheToResult(
                    { ...cached, currentVersion, hasUpdate },
                    true,
                ),
                error: message,
            }
            emitStatus(result)
            return result
        }

        const fallback: UpdateCheckResult = {
            currentVersion,
            latestTag: "",
            latestVersion: "",
            releaseName: "",
            releaseBody: "",
            htmlUrl: resolveUpdateUrl(`${GITHUB_REPO_URL}/releases/latest`),
            publishedAt: null,
            hasUpdate: false,
            fromCache: false,
            checkedAt: now,
            error: message,
        }
        emitStatus(fallback)
        return fallback
    }
}

function peekCachedUpdate(): UpdateCheckResult | null {
    const cached = readCache()
    if (!cached) {
        return null
    }
    return cacheToResult(cached, true)
}

function subscribeUpdateStatus(
    listener: (result: UpdateCheckResult) => void,
): () => void {
    function onEvent(event: Event) {
        const detail = (event as CustomEvent<UpdateCheckResult>).detail
        if (detail) {
            listener(detail)
        }
    }
    window.addEventListener(STATUS_EVENT, onEvent)
    return () => window.removeEventListener(STATUS_EVENT, onEvent)
}

export {
    CACHE_TTL_MS,
    checkAppUpdate,
    isNewerVersion,
    normalizeSemver,
    peekCachedUpdate,
    STATUS_EVENT,
    subscribeUpdateStatus,
}
export type { UpdateCheckResult }