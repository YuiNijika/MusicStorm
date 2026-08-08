const TTL_STORAGE_KEY = "musicstorm-api-cache-ttl-ms"
const TTL_EVENT = "musicstorm:api-cache-ttl"

const AUTO_PURGE_KEY = "musicstorm-api-cache-auto-purge"
const AUTO_PURGE_EVENT = "musicstorm:api-cache-auto-purge"

const DEFAULT_TTL_MS = 5 * 60 * 1000
const TTL_MIN_MS = 30 * 1000
const TTL_MAX_MS = 24 * 60 * 60 * 1000

const PURGE_INTERVAL_MIN_MS = 30_000
const PURGE_INTERVAL_MAX_MS = 5 * 60_000

const TTL_PRESETS: { id: string; label: string; ms: number }[] = [
    { id: "30s", label: "30 秒", ms: 30_000 },
    { id: "2m", label: "2 分钟", ms: 2 * 60_000 },
    { id: "5m", label: "5 分钟", ms: 5 * 60_000 },
    { id: "15m", label: "15 分钟", ms: 15 * 60_000 },
    { id: "1h", label: "1 小时", ms: 60 * 60_000 },
    { id: "off", label: "关闭", ms: 0 },
]

function clampTtl(ms: number): number {
    if (!Number.isFinite(ms) || ms <= 0) {
        return 0
    }
    return Math.min(TTL_MAX_MS, Math.max(TTL_MIN_MS, Math.round(ms)))
}

function getApiCacheTtlMs(): number {
    if (typeof window === "undefined") {
        return DEFAULT_TTL_MS
    }
    const raw = window.localStorage.getItem(TTL_STORAGE_KEY)
    if (raw == null) {
        return DEFAULT_TTL_MS
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) {
        return DEFAULT_TTL_MS
    }
    if (n <= 0) {
        return 0
    }
    return clampTtl(n)
}

function setApiCacheTtlMs(ms: number): void {
    const next = ms <= 0 ? 0 : clampTtl(ms)
    window.localStorage.setItem(TTL_STORAGE_KEY, String(next))
    window.dispatchEvent(new CustomEvent(TTL_EVENT))
}

function getApiCacheAutoPurge(): boolean {
    if (typeof window === "undefined") {
        return true
    }
    const raw = window.localStorage.getItem(AUTO_PURGE_KEY)
    if (raw == null) {
        return true
    }
    return raw !== "0" && raw !== "false"
}

function setApiCacheAutoPurge(enabled: boolean): void {
    window.localStorage.setItem(AUTO_PURGE_KEY, enabled ? "1" : "0")
    window.dispatchEvent(new CustomEvent(AUTO_PURGE_EVENT))
}

/**
 * 清理周期：约 TTL 一半，夹在 30s–5min。
 * TTL 关闭时仍用默认 5min 扫一次孤儿/历史过期。
 */
function getApiCachePurgeIntervalMs(): number {
    const ttl = getApiCacheTtlMs()
    const base = ttl > 0 ? Math.floor(ttl / 2) : DEFAULT_TTL_MS
    return Math.min(PURGE_INTERVAL_MAX_MS, Math.max(PURGE_INTERVAL_MIN_MS, base))
}

export {
    AUTO_PURGE_EVENT,
    AUTO_PURGE_KEY,
    DEFAULT_TTL_MS,
    TTL_EVENT,
    TTL_MAX_MS,
    TTL_MIN_MS,
    TTL_PRESETS,
    TTL_STORAGE_KEY,
    getApiCacheAutoPurge,
    getApiCachePurgeIntervalMs,
    getApiCacheTtlMs,
    setApiCacheAutoPurge,
    setApiCacheTtlMs,
}