import type { WebLocalTrack } from "@/lib/local/web-import"

/**
 * 网页版本地音乐持久化到 IndexedDB。
 *
 * FSA 目录导入存句柄引用，几乎零占用；其余存 File 副本。
 * 刷新后恢复列表；隐私模式等场景写入失败降级为内存会话。
 */

const DB_NAME = "musicstorm-web-library"
const DB_VERSION = 2
const STORE_NAME = "tracks"

export type StoredWebTrack = {
    id: string
    title: string
    artist: string
    album: string
    coverUrl: string
    durationMs: number
    fileName: string
    /** 仅非 FSA 导入时存音频副本 */
    file?: File
    /** FSA 目录句柄：存引用不复制音频 */
    directoryHandle?: FileSystemDirectoryHandle
    relativePath?: string
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

async function getFileFromDirectory(
    root: FileSystemDirectoryHandle,
    relativePath: string,
): Promise<File> {
    const parts = relativePath.split("/").filter(Boolean)
    if (parts.length === 0) {
        throw new Error("空相对路径")
    }
    let dir = root
    for (let i = 0; i < parts.length - 1; i += 1) {
        dir = await dir.getDirectoryHandle(parts[i])
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
    return fileHandle.getFile()
}

/** 将内存导入的曲目持久化；配额耗尽等失败时抛错由调用方降级。 */
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
            // FSA 引用型：存句柄 + 相对路径，不复制音频；input 型存 File 副本
            const stored: StoredWebTrack = {
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album ?? "",
                coverUrl: track.coverUrl ?? "",
                durationMs: track.durationMs,
                fileName: track.fileName ?? track.title,
                ...(track.directoryHandle && track.relativePath
                    ? {
                          directoryHandle: track.directoryHandle,
                          relativePath: track.relativePath,
                      }
                    : { file: track.file }),
                importedAt: now,
            }
            store.put(stored)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error("写入 IndexedDB 失败"))
        tx.onabort = () => reject(tx.error ?? new Error("写入 IndexedDB 中止"))
    })
}

/** 从 IndexedDB 恢复全部曲目；FSA 型实时读本地文件，授权失效的条目跳过。 */
async function loadWebLibrary(): Promise<WebLocalTrack[]> {
    const db = await openDb()
    const all = await readAllTracks(db)
    const restored = await Promise.all(
        all
            .sort((a, b) => a.importedAt - b.importedAt)
            .map(async (item): Promise<WebLocalTrack | null> => {
                const base = {
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    album: item.album,
                    coverUrl: item.coverUrl,
                    durationMs: item.durationMs,
                    source: "local" as const,
                    fileName: item.fileName,
                }
                if (item.directoryHandle && item.relativePath) {
                    try {
                        // 浏览器重启后授权可能失效：失败即跳过，重新导入即可恢复
                        const file = await getFileFromDirectory(
                            item.directoryHandle,
                            item.relativePath,
                        )
                        return {
                            ...base,
                            file,
                            filePath: URL.createObjectURL(file),
                            directoryHandle: item.directoryHandle,
                            relativePath: item.relativePath,
                        }
                    } catch {
                        return null
                    }
                }
                if (item.file) {
                    return {
                        ...base,
                        file: item.file,
                        filePath: URL.createObjectURL(item.file),
                    }
                }
                return null
            }),
    )
    return restored.filter((track): track is WebLocalTrack => track != null)
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
