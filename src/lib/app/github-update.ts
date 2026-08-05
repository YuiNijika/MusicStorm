/**
 * GitHub Releases 更新检测（方案 B：检测 + 引导下载）
 * - semver 比较，tag 去 v
 * - 默认缓存 5 小时，可 force 刷新
 */

import { GITHUB_REPO_URL } from "@/lib/open-external"

const OWNER = "YuiNijika"
const REPO = "MusicStorm"
const CACHE_KEY = "musicstorm-github-release-cache"
const CACHE_TTL_MS = 5 * 60 * 60 * 1000
const STATUS_EVENT = "musicstorm:update-status"
const API_LATEST = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`

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

/** 去掉前导 v/V，只取 x.y.z 主版本 */
function normalizeSemver(raw: string): string | null {
    const cleaned = raw.trim().replace(/^v/i, "")
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned)
    if (!match) {
        return null
    }
    return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`
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

/** latest > current 才算有更新 */
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
        const raw = window.localStorage.getItem(CACHE_KEY)
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
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
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

/**
 * 检测更新。
 * @param force 忽略 5h 缓存，强制打 GitHub API
 */
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
        const response = await fetch(API_LATEST, {
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

        const data = (await response.json()) as GithubReleaseRaw
        if (data.draft) {
            throw new Error("最新 Release 仍为 draft")
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

/** 读缓存快照（不发网）；无缓存则 null */
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