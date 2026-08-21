// 远程封面缓存：URL → 本地文件，Rust 端去重存盘 + 本模块维护索引懒加载
// 命中直接用本地 asset URL（离线可用、零网络往返）；未命中先用远程 URL 渲染，后台下载就位后不阻塞首帧
// 索引键为 URL 本身：专辑封面同 URL 被多首歌引用时共享同一缓存

import { dbGetSetting, dbSetSetting } from "@/lib/db/play-stats"
import { cacheCoverUrl, type CachedCover } from "@/lib/local/cover"

const SETTING_KEY = "cover.remote.v1"
const REMOTE_COVER_EVENT = "musicstorm-remote-cover-ready"

// 下载失败后短时间内不再重试，防止滚动触发对同一死链的反复下载
const FAILED_RETRY_MS = 10 * 60 * 1000
// 并发下载上限：封面集中在首屏时避免一次性占满 Rust 阻塞线程池
const MAX_CONCURRENT_DOWNLOADS = 4

type RemoteCoverMap = Record<string, CachedCover>

let cache: RemoteCoverMap = {}
let ready = false
let loadPromise: Promise<void> | null = null
// 进行中的下载去重，避免同一 URL 并发重复请求
const inFlight = new Map<string, Promise<CachedCover | null>>()
// 失败墓碑：urlHash → 失败时刻，仅内存态，重启后自然重置
const failedAt = new Map<string, number>()
// 并发闸：活跃下载数 + 排队等待者
let activeDownloads = 0
const downloadWaiters: Array<() => void> = []

async function withDownloadSlot<T>(task: () => Promise<T>): Promise<T> {
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
        await new Promise<void>((resolve) => downloadWaiters.push(resolve))
    }
    activeDownloads += 1
    try {
        return await task()
    } finally {
        activeDownloads -= 1
        const next = downloadWaiters.shift()
        if (next) {
            next()
        }
    }
}

function normalizeMap(value: unknown): RemoteCoverMap {
    if (!value || typeof value !== "object") {
        return {}
    }
    const normalized: RemoteCoverMap = {}
    for (const [urlHash, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") {
            continue
        }
        const item = raw as Record<string, unknown>
        const originalPath =
            typeof item.originalPath === "string" ? item.originalPath.trim() : ""
        const thumbnailPath =
            typeof item.thumbnailPath === "string" ? item.thumbnailPath.trim() : ""
        if (originalPath) {
            normalized[urlHash] = {
                originalPath,
                thumbnailPath: thumbnailPath || originalPath,
            }
        }
    }
    return normalized
}

async function ensureLoaded(): Promise<void> {
    if (ready) {
        return
    }
    if (loadPromise) {
        return loadPromise
    }
    loadPromise = (async () => {
        const raw = await dbGetSetting(SETTING_KEY)
        if (raw) {
            try {
                cache = normalizeMap(JSON.parse(raw))
            } catch {
                cache = {}
            }
        }
        ready = true
    })().finally(() => {
        loadPromise = null
    })
    return loadPromise
}

async function writeMap(next: RemoteCoverMap): Promise<void> {
    cache = next
    await dbSetSetting(SETTING_KEY, JSON.stringify(next))
}

function urlHash(url: string): string {
    // URL 可能很长（CDN 带签名参数），索引键用稳定哈希
    let hash = 5381
    for (let i = 0; i < url.length; i += 1) {
        hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0
    }
    return hash.toString(36)
}

function getCachedRemoteCover(url: string): CachedCover | null {
    if (!ready) {
        return null
    }
    return cache[urlHash(url)] ?? null
}

async function ensureRemoteCoverCached(url: string): Promise<CachedCover | null> {
    const trimmed = url.trim()
    if (!trimmed) {
        return null
    }
    await ensureLoaded()
    const hit = getCachedRemoteCover(trimmed)
    if (hit) {
        return hit
    }
    const failedTs = failedAt.get(urlHash(trimmed))
    if (failedTs !== undefined && Date.now() - failedTs < FAILED_RETRY_MS) {
        return null
    }
    const pending = inFlight.get(trimmed)
    if (pending) {
        return pending
    }
    const task = withDownloadSlot(async () => {
        try {
            const cached = await cacheCoverUrl(trimmed)
            await writeMap({ ...cache, [urlHash(trimmed)]: cached })
            window.dispatchEvent(new CustomEvent(REMOTE_COVER_EVENT, { detail: trimmed }))
            return cached
        } catch {
            // 下载失败记住失败时刻，避免滚动时反复请求死链
            failedAt.set(urlHash(trimmed), Date.now())
            return null
        } finally {
            inFlight.delete(trimmed)
        }
    })
    inFlight.set(trimmed, task)
    return task
}

export {
    REMOTE_COVER_EVENT,
    ensureRemoteCoverCached,
    getCachedRemoteCover,
}
