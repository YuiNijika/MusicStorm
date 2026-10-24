// 远程封面缓存：URL → 本地文件，Rust 端去重存盘 + 本模块维护索引懒加载
// 命中直接用本地 asset URL（离线可用、零网络往返）；未命中先用远程 URL 渲染，后台下载就位后不阻塞首帧
// 索引键为 URL 本身：专辑封面同 URL 被多首歌引用时共享同一缓存

import { dbGetSetting, dbSetSetting } from "@/lib/db/play-stats"
import { cacheCoverUrl, isTauriRuntime, type CachedCover } from "@/lib/local/cover"
import { getCoverCacheLimitBytes } from "@/lib/music/cover-cache-prefs"

const SETTING_KEY = "cover.remote.v1"
const REMOTE_COVER_EVENT = "musicstorm-remote-cover-ready"

// 下载失败后短时间内不再重试，防止滚动触发对同一死链的反复下载
const FAILED_RETRY_MS = 10 * 60 * 1000
// 并发下载上限：封面集中在首屏时避免一次性占满 Rust 阻塞线程池
const MAX_CONCURRENT_DOWNLOADS = 4
// 启动后延迟对账：清理命令删文件时索引不同步，等首屏渲染不忙了再剪枝
const STARTUP_PRUNE_DELAY_MS = 2500

type RemoteCoverEntry = CachedCover & {
    /** 原始远程 URL：剪枝后按 URL 精确广播，让对应封面回源重下 */
    url?: string
}

type RemoteCoverMap = Record<string, RemoteCoverEntry>

let cache: RemoteCoverMap = {}
let ready = false
let loadPromise: Promise<void> | null = null
// 读库失败时置位：本轮会话只更新内存，禁止写回，
// 防止用空索引覆盖持久层（封面索引全量丢失）
let persistDisabled = false
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
                url: typeof item.url === "string" ? item.url : undefined,
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
        let raw: string | null = null
        try {
            raw = await dbGetSetting(SETTING_KEY)
        } catch {
            persistDisabled = true
        }
        if (raw) {
            try {
                cache = normalizeMap(JSON.parse(raw))
            } catch {
                cache = {}
            }
        }
        ready = true
        if (!persistDisabled) {
            // 磁盘上的文件可能被清理命令、手动删除过，启动后对账一次
            scheduleStartupPrune()
        }
    })().finally(() => {
        loadPromise = null
    })
    return loadPromise
}

async function writeMap(next: RemoteCoverMap): Promise<void> {
    cache = next
    if (persistDisabled) {
        return
    }
    try {
        await dbSetSetting(SETTING_KEY, JSON.stringify(next))
    } catch {
        persistDisabled = true
    }
}

function normalizeCoverUrl(url: string): string {
 try {
 const parsed = new URL(url.trim())
 if (
 parsed.hostname === "hdslb.com" ||
 parsed.hostname.endsWith(".hdslb.com") ||
 parsed.hostname === "biliimg.com" ||
 parsed.hostname.endsWith(".biliimg.com") ||
 parsed.hostname === "bilibili.com" ||
 parsed.hostname.endsWith(".bilibili.com") ||
 parsed.hostname.endsWith(".126.net") ||
 parsed.hostname.endsWith(".163.com")
 ) {
 parsed.protocol = "https:"
 parsed.search = ""
 return parsed.toString()
 }
 } catch {
 return url.trim()
 }
 return url.trim()
}

function isBilibiliCoverUrl(url: string): boolean {
 try {
 const host = new URL(url.trim()).hostname.toLowerCase()
 return (
 host === "bilibili.com" ||
 host.endsWith(".bilibili.com") ||
 host === "hdslb.com" ||
 host.endsWith(".hdslb.com") ||
 host === "biliimg.com" ||
 host.endsWith(".biliimg.com") ||
 host === "bilivideo.com" ||
 host.endsWith(".bilivideo.com") ||
 host === "bilivideo.cn" ||
 host.endsWith(".bilivideo.cn")
 )
 } catch {
 return false
 }
}

function urlHash(url: string): string {
 // CDN会给同一张图追加短期参数，先去掉查询串，避免重复下载与失配
 const normalized = normalizeCoverUrl(url)
 let hash =5381
 for (let i =0; i < normalized.length; i +=1) {
 hash = ((hash <<5) + hash + normalized.charCodeAt(i)) >>>0
 }
 return hash.toString(36)
}

function findCacheKey(url: string): string | null {
 const direct = urlHash(url)
 if (cache[direct]) {
 return direct
 }
 return null
}

function getCachedRemoteCover(url: string): CachedCover | null {
    if (!ready) {
        return null
    }
 const key = findCacheKey(url)
 return key ? (cache[key] ?? null) : null
}

async function ensureRemoteCoverCached(url: string): Promise<CachedCover | null> {
    const trimmed = url.trim()
    if (!trimmed) {
        return null
    }
    // 关闭封面缓存：停止下载写盘，直接走远程 URL
    if (getCoverCacheLimitBytes() === 0) {
        return null
    }
    await ensureLoaded()
    const hit = getCachedRemoteCover(trimmed)
    if (hit) {
        return hit
    }
 const failureKey = urlHash(trimmed)
 const failedTs = failedAt.get(failureKey)
    if (failedTs !== undefined && Date.now() - failedTs < FAILED_RETRY_MS) {
        return null
    }
 const pendingKey = normalizeCoverUrl(trimmed)
 const pending = inFlight.get(pendingKey)
    if (pending) {
        return pending
    }
 const task = withDownloadSlot(async () => {
 try {
 //缓存下载由客户端补齐图片请求头，刷新后也能完成封面落盘
 const cached = await cacheCoverUrl(trimmed)
            // 带上原始 URL，剪枝后才能精确广播到引用该封面的组件
 const key = urlHash(trimmed)
 await writeMap({
 ...cache,
 [key]: { ...cached, url: normalizeCoverUrl(trimmed) },
 })
            window.dispatchEvent(new CustomEvent(REMOTE_COVER_EVENT, { detail: trimmed }))
            return cached
        } catch {
            // 下载失败记住失败时刻，避免滚动时反复请求死链
 failedAt.set(failureKey, Date.now())
            return null
        } finally {
 inFlight.delete(pendingKey)
        }
    })
 inFlight.set(pendingKey, task)
    return task
}

let pruneTimer: number | null = null

function scheduleStartupPrune(): void {
    if (pruneTimer != null) {
        return
    }
    pruneTimer = window.setTimeout(() => {
        pruneTimer = null
        void pruneRemoteCoverIndex()
    }, STARTUP_PRUNE_DELAY_MS)
}

// 索引与磁盘对账：清理命令直接删文件，索引残留的失效条目会让封面永远
// 指向已删除的本地文件且不再重下。剪掉失效条目后广播，未存 URL 的旧条目
// 广播空 detail，让所有挂载中的封面自行重新解析。
async function pruneRemoteCoverIndex(): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    await ensureLoaded()
    const entries = Object.entries(cache)
    if (entries.length === 0) {
        return
    }
    // 每条占两个连续槽位（原图 + 缩略图），同序返回存在性
    const paths: string[] = []
    for (const [, item] of entries) {
        paths.push(item.originalPath, item.thumbnailPath)
    }
    let existence: boolean[]
    try {
        const { invoke } = await import("@tauri-apps/api/core")
        existence = await invoke<boolean[]>("cover_paths_exist", { paths })
    } catch {
        // 无运行时或命令失败：保持索引不动，渲染层 onError 兜底
        return
    }
    // 对账窗口内有并发下载/invalidate 写入：只剔除确认失效的 key，
    // 其余保留最新 cache，避免用旧快照覆盖丢条目
    const staleKeys: string[] = []
    const staleUrls: string[] = []
    let hasUnknownUrl = false
    entries.forEach(([key, item], index) => {
        const exists = existence[index * 2] && existence[index * 2 + 1]
        if (!exists) {
            staleKeys.push(key)
            if (item.url) {
                staleUrls.push(item.url)
            } else {
                hasUnknownUrl = true
            }
        }
    })
    if (staleKeys.length === 0) {
        return
    }
    const next = { ...cache }
    for (const key of staleKeys) {
        delete next[key]
    }
    await writeMap(next)
    for (const url of staleUrls) {
        window.dispatchEvent(new CustomEvent(REMOTE_COVER_EVENT, { detail: url }))
    }
    if (hasUnknownUrl) {
        window.dispatchEvent(new CustomEvent(REMOTE_COVER_EVENT, { detail: "" }))
    }
}

// 渲染层 onError 自愈入口：把失效条目从索引剔除并立刻回源重下
async function invalidateRemoteCover(url: string): Promise<void> {
    const trimmed = url.trim()
    if (!trimmed) {
        return
    }
    await ensureLoaded()
 const key = findCacheKey(trimmed)
 if (!key || !cache[key]) {
 failedAt.delete(urlHash(trimmed))
 void ensureRemoteCoverCached(trimmed)
        return
    }
 failedAt.delete(urlHash(trimmed))
    const next = { ...cache }
    delete next[key]
    await writeMap(next)
    // 不清失败墓碑：坏图（能下载但字节损坏）会 onError→重下→再 onError
    // 无限循环，冷却期内跳过重下，渲染回退远程 URL 或占位
    void ensureRemoteCoverCached(trimmed)
}

export {
    REMOTE_COVER_EVENT,
    ensureRemoteCoverCached,
    getCachedRemoteCover,
 isBilibiliCoverUrl,
    invalidateRemoteCover,
    pruneRemoteCoverIndex,
}
