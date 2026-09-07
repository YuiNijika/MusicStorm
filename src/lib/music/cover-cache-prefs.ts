// 封面缓存大小阈值偏好：超出后按最旧清理原图与缩略图

const LIMIT_STORAGE_KEY = "musicstorm-cover-cache-limit-bytes"
const LIMIT_EVENT = "musicstorm:cover-cache-limit"

const MB = 1024 * 1024

const LIMIT_PRESETS: { id: string; label: string; bytes: number }[] = [
    // 关闭（0）由设置页开关控制，预设只留可用档位
    { id: "100mb", label: "100 MB", bytes: 100 * MB },
    { id: "200mb", label: "200 MB", bytes: 200 * MB },
    { id: "400mb", label: "400 MB", bytes: 400 * MB },
    { id: "800mb", label: "800 MB", bytes: 800 * MB },
    { id: "1gb", label: "1 GB", bytes: 1024 * MB },
]

const DEFAULT_LIMIT_BYTES = 400 * MB

// 移动端内部存储宝贵：启动时按此上限收敛封面缓存，即使未改设置
const MOBILE_COVER_CACHE_LIMIT = 128 * MB

function getCoverCacheLimitBytes(): number {
    if (typeof window === "undefined") {
        return DEFAULT_LIMIT_BYTES
    }
    const raw = window.localStorage.getItem(LIMIT_STORAGE_KEY)
    if (raw == null) {
        return DEFAULT_LIMIT_BYTES
    }
    const n = Number(raw)
    // 0 表示关闭封面缓存；负数为脏数据，回默认
    if (!Number.isFinite(n) || n < 0) {
        return DEFAULT_LIMIT_BYTES
    }
    return n
}

function setCoverCacheLimitBytes(bytes: number): void {
    // 允许 0（关闭缓存）；其余非法值回默认
    const next = Number.isFinite(bytes) && bytes >= 0 ? bytes : DEFAULT_LIMIT_BYTES
    window.localStorage.setItem(LIMIT_STORAGE_KEY, String(next))
    window.dispatchEvent(new CustomEvent(LIMIT_EVENT))
}

export {
    DEFAULT_LIMIT_BYTES,
    LIMIT_EVENT,
    LIMIT_PRESETS,
    MOBILE_COVER_CACHE_LIMIT,
    getCoverCacheLimitBytes,
    setCoverCacheLimitBytes,
}
