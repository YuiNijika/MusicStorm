import type { WebLocalTrack } from "@/lib/local/web-import"

/**
 * 网页版本地音乐持久化（IndexedDB）。
 *
 * 浏览器无文件系统权限：导入的音频以 File 对象结构化克隆进 IndexedDB，
 * 刷新后从库中恢复并重建 blob URL 继续播放。数据不落磁盘文件系统，
 * 仅占用浏览器配额（navigator.storage.estimate 可查）。
 * IndexedDB 不可用（隐私模式/被禁用）时写入失败降级为纯内存会话。
 */

const DB_NAME = "musicstorm-web-library"
const DB_VERSION = 1
const STORE_NAME = "tracks"

export type StoredWebTrack = {
    id: string
    title: string
    artist: string
    album: string
    /** base64 dataURL，可能为空串 */
    coverUrl: string
    durationMs: number
    fileName: string
    /** 音频本体（File 保留 type/name，可再次 createObjectURL） */
    file: File
    importedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) {
        return dbPromise
    }
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB 不可用"))
            return
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" })
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
            reject(request.error ?? new Error("打开 IndexedDB 失败"))
        // 多标签页下旧版本连接会阻塞升级；拒绝而非挂起，让调用方降级
        request.onblocked = () => reject(new Error("IndexedDB 被占用"))
    })
    return dbPromise
}

function readAllTracks(db: IDBDatabase): Promise<StoredWebTrack[]> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly")
        const request = tx.objectStore(STORE_NAME).getAll()
        request.onsuccess = () => resolve(request.result as StoredWebTrack[])
        request.onerror = () =>
            reject(request.error ?? new Error("读取 IndexedDB 失败"))
    })
}

/** 将内存导入的曲目持久化到 IndexedDB；配额耗尽等失败时抛错由调用方降级。 */
async function saveWebTracks(tracks: WebLocalTrack[]): Promise<void> {
    if (tracks.length === 0) {
        return
    }
    const db = await openDb()
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        const store = tx.objectStore(STORE_NAME)
        for (const track of tracks) {
            const stored: StoredWebTrack = {
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album ?? "",
                coverUrl: track.coverUrl ?? "",
                durationMs: track.durationMs,
                fileName: track.fileName ?? track.title,
                file: track.file,
                importedAt: now,
            }
            store.put(stored)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("写入 IndexedDB 失败"))
        tx.onabort = () => reject(tx.error ?? new Error("写入 IndexedDB 中止"))
    })
}

/** 从 IndexedDB 恢复全部曲目，并为每首重建 blob URL 供播放。 */
async function loadWebLibrary(): Promise<WebLocalTrack[]> {
    const db = await openDb()
    const all = await readAllTracks(db)
    return all
        .sort((a, b) => a.importedAt - b.importedAt)
        .map((item) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album,
            coverUrl: item.coverUrl,
            durationMs: item.durationMs,
            source: "local" as const,
            filePath: URL.createObjectURL(item.file),
            fileName: item.fileName,
            file: item.file,
        }))
}

async function removeWebTrack(id: string): Promise<void> {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        tx.objectStore(STORE_NAME).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("删除 IndexedDB 失败"))
        tx.onabort = () => reject(tx.error ?? new Error("删除 IndexedDB 中止"))
    })
}

/** 清空全部持久化曲目；调用方需先 revoke 内存中的 blob URL。 */
async function clearWebLibrary(): Promise<void> {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        tx.objectStore(STORE_NAME).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("清空 IndexedDB 失败"))
        tx.onabort = () => reject(tx.error ?? new Error("清空 IndexedDB 中止"))
    })
}

/** 浏览器存储占用（整个 origin，含 API 缓存等），不可用时返回 null。 */
async function estimateWebStorage(): Promise<{
    usage: number
    quota: number
} | null> {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
        return null
    }
    try {
        const est = await navigator.storage.estimate()
        return est.usage != null && est.quota != null
            ? { usage: est.usage, quota: est.quota }
            : null
    } catch {
        return null
    }
}

export {
    clearWebLibrary,
    estimateWebStorage,
    loadWebLibrary,
    removeWebTrack,
    saveWebTracks,
}
