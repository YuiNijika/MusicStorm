/**
 * 远程封面缓存（网易云 CDN 等）：URL → 本地文件
 * - Rust cache_cover_url 负责下载并去重存盘（内容 MD5，同 URL 天然单份）
 * - 本模块只维护「URL → 缓存路径」索引，存 SQLite，懒加载
 * - 命中：Cover 直接用本地 asset URL，离线可用、零网络往返
 * - 未命中：先用远程 URL 顶住渲染，后台下载完成后索引就位（不阻塞首帧）
 * 索引键为 URL 本身：专辑封面同 URL 被多首歌引用时共享同一缓存
 */

import { dbGetSetting, dbSetSetting } from "@/lib/db/play-stats"
import { cacheCoverUrl, type CachedCover } from "@/lib/local/cover"

const SETTING_KEY = "cover.remote.v1"
/** 缓存完成广播，Cover 内部监听后切换到本地 URL */
const REMOTE_COVER_EVENT = "musicstorm-remote-cover-ready"

type RemoteCoverMap = Record<string, CachedCover>

let cache: RemoteCoverMap = {}
let ready = false
let loadPromise: Promise<void> | null = null
/** 进行中的下载去重，避免同一 URL 并发重复请求 */
const inFlight = new Map<string, Promise<CachedCover | null>>()

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

/** 同步查索引；未命中返回 null（调用方先渲染远程 URL） */
function getCachedRemoteCover(url: string): CachedCover | null {
    if (!ready) {
        return null
    }
    return cache[urlHash(url)] ?? null
}

/**
 * 确保远程封面已缓存：
 * - 已缓存 → 直接返回
 * - 未缓存 → 下载 + 写索引 + 广播事件（同 URL 并发去重）
 * 失败返回 null，不阻塞渲染（保持远程 URL）
 */
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
    const pending = inFlight.get(trimmed)
    if (pending) {
        return pending
    }
    const task = (async () => {
        try {
            const cached = await cacheCoverUrl(trimmed)
            await writeMap({ ...cache, [urlHash(trimmed)]: cached })
            window.dispatchEvent(new CustomEvent(REMOTE_COVER_EVENT, { detail: trimmed }))
            return cached
        } catch {
            // 下载失败保持远程 URL，下次渲染再试
            return null
        } finally {
            inFlight.delete(trimmed)
        }
    })()
    inFlight.set(trimmed, task)
    return task
}

export {
    REMOTE_COVER_EVENT,
    ensureRemoteCoverCached,
    getCachedRemoteCover,
}
