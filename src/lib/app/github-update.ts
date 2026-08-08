import { GITHUB_REPO_URL } from "@/lib/open-external"

const OWNER = "YuiNijika"
const REPO = "MusicStorm"
const CACHE_TTL_MS = 5 * 60 * 60 * 1000
const STATUS_EVENT = "musicstorm:update-status"
const API_RELEASES = `https://api.github.com/repos/${OWNER}/${REPO}/releases`

// Android 独立版本线：tag 带 -android 后缀，与桌面 vX.Y.Z 分开，
// 避免 releases/latest 按时间排序导致跨平台串台
const ANDROID_TAG_SUFFIX = "-android"

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

// Android：tag 形如 v0.0.1-android；桌面：纯 vX.Y.Z
function isAndroidPlatform(): boolean {
    try {
        return /android/i.test(navigator.userAgent)
    } catch {
        return false
    }
}

function tagMatchesPlatform(tag: string): boolean {
    const isAndroid = isAndroidPlatform()
    const hasSuffix = tag.trim().endsWith(ANDROID_TAG_SUFFIX)
    return isAndroid ? hasSuffix : !hasSuffix
}

function cacheKeyForPlatform(): string {
    return isAndroidPlatform()
        ? "musicstorm-github-release-cache-android"
        : "musicstorm-github-release-cache"
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
    try {
        const { getVersion } = await import("@tauri-apps/api/app")
        const v = await getVersion()
        return normalizeSemver(v) ?? v.trim()
    } catch {
        // 浏览器预览：退回 package 占位，仅开发用
        return "0.1.0"
    }
}

function readCache(): CachePayload | null {
    if (typeof window === "undefined") {
        return null
    }
    try {
        const raw = window.localStorage.getItem(cacheKeyForPlatform())
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
            cacheKeyForPlatform(),
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
        const response = await fetch(API_RELEASES, {
            method: "GET",
            headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                // GitHub 要求有意义的 UA
                "User-Agent": `MusicStorm/${currentVersion}`,
            },
        })

        if (!response.ok) {
            throw new Error(`GitHub API HTTP ${response.status}`)
        }

        const all = (await response.json()) as GithubReleaseRaw[]
        // 平台隔离：桌面只看 vX.Y.Z，Android 只看 vX.Y.Z-android
        const data = all.find(
            (r) =>
                !r.draft &&
                tagMatchesPlatform(r.tag_name ?? ""),
        )
        if (!data) {
            throw new Error("当前平台暂无发布版本")
        }

        const latestTag = (data.tag_name ?? "").trim()
        const latestVersion = normalizeSemver(latestTag)
        if (!latestVersion) {
            throw new Error(`无法解析版本号: ${latestTag || "(空)"}`)
        }

        const htmlUrl =
            data.html_url?.trim() ||
            `${GITHUB_REPO_URL}/releases/tag/${encodeURIComponent(latestTag)}`
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
            htmlUrl: `${GITHUB_REPO_URL}/releases/latest`,
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