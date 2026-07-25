import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/lib/storage/paths"

type ApiCacheEntry = {
    body: string
    createdAt: number
    expiresAt: number
}

/** 进程内去重：同一 key 并发只打一次网 */
const inflight = new Map<string, Promise<unknown>>()

async function apiCacheGet(key: string): Promise<string | null> {
    if (!isTauriRuntime()) {
        return null
    }
    try {
        const entry = await invoke<ApiCacheEntry | null>("api_cache_get", { key })
        return entry?.body ?? null
    } catch {
        return null
    }
}

async function apiCacheSet(key: string, body: string, ttlMs: number): Promise<void> {
    if (!isTauriRuntime() || ttlMs <= 0) {
        return
    }
    try {
        await invoke("api_cache_set", { key, body, ttlMs })
    } catch {
        // ignore
    }
}

async function apiCacheClear(): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    try {
        await invoke("api_cache_clear")
    } catch {
        // ignore
    }
}

/** 删除已超过 expires_at 的条目与对应文件；返回删除条数 */
async function apiCachePurgeExpired(): Promise<number> {
    if (!isTauriRuntime()) {
        return 0
    }
    try {
        return await invoke<number>("api_cache_purge_expired")
    } catch {
        return 0
    }
}

function withInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key)
    if (existing) {
        return existing as Promise<T>
    }
    const promise = factory().finally(() => {
        inflight.delete(key)
    })
    inflight.set(key, promise)
    return promise
}

export {
    apiCacheClear,
    apiCacheGet,
    apiCachePurgeExpired,
    apiCacheSet,
    withInflight,
}
export type { ApiCacheEntry }