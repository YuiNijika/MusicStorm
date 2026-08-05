/** 歌曲封面覆盖：SQLite 保存短路径索引，图片二进制在 cache/covers。 */

import { dbGetSetting, dbSetSetting } from "@/lib/db/play-stats"
import { coverPathToUrl, type CachedCover } from "@/lib/local/cover"

const SETTING_KEY = "cover.overrides.v2"
const LEGACY_STORAGE_KEY = "musicstorm-cover-overrides"
const COVER_OVERRIDE_EVENT = "musicstorm-cover-override"

type CoverOverride = CachedCover
type OverrideMap = Record<string, CoverOverride>

let cache: OverrideMap = {}
let ready = false
let loadPromise: Promise<void> | null = null

function normalizeMap(value: unknown): OverrideMap {
    if (!value || typeof value !== "object") {
        return {}
    }
    const normalized: OverrideMap = {}
    for (const [trackId, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") {
            continue
        }
        const item = raw as Record<string, unknown>
        const originalPath =
            typeof item.originalPath === "string" ? item.originalPath.trim() : ""
        const thumbnailPath =
            typeof item.thumbnailPath === "string" ? item.thumbnailPath.trim() : ""
        if (originalPath) {
            normalized[trackId] = {
                originalPath,
                thumbnailPath: thumbnailPath || originalPath,
            }
        }
    }
    return normalized
}

async function ensureCoverOverridesLoaded(): Promise<void> {
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
        window.dispatchEvent(new Event(COVER_OVERRIDE_EVENT))
    })().finally(() => {
        loadPromise = null
    })
    return loadPromise
}

function getCoverOverride(trackId: string): CoverOverride | null {
    return cache[trackId] ?? null
}

async function writeMap(next: OverrideMap): Promise<void> {
    cache = next
    window.dispatchEvent(new Event(COVER_OVERRIDE_EVENT))
    await dbSetSetting(SETTING_KEY, JSON.stringify(next))
}

async function setCoverOverride(trackId: string, cover: CachedCover): Promise<void> {
    await ensureCoverOverridesLoaded()
    await writeMap({ ...cache, [trackId]: cover })
}

async function clearCoverOverride(trackId: string): Promise<void> {
    await ensureCoverOverridesLoaded()
    const next = { ...cache }
    delete next[trackId]
    await writeMap(next)
}

/** 列表使用缩略图；播放器等大图场景使用原图。 */
function resolveTrackCoverUrl(
    trackId: string,
    coverUrl: string,
    kind: "original" | "thumbnail" = "original",
): string {
    const override = getCoverOverride(trackId)
    if (!override) {
        return coverUrl
    }
    return coverPathToUrl(
        kind === "thumbnail" ? override.thumbnailPath : override.originalPath,
    )
}

/** 旧 Base64 不再参与新写入；迁移成功后由调用方清理。 */
function readLegacyCoverOverrides(): Record<string, string> {
    if (typeof window === "undefined") {
        return {}
    }
    try {
        const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as unknown) : null
        if (!parsed || typeof parsed !== "object") {
            return {}
        }
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === "string" && entry[1].startsWith("data:"),
            ),
        )
    } catch {
        return {}
    }
}

/** 迁移完成后清理旧 localStorage base64 条目，释放 WebView 存储。 */
function clearLegacyCoverOverrides(): void {
    if (typeof window === "undefined") {
        return
    }
    try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
        // private mode / quota
    }
}

async function migrateLegacyOverrides(): Promise<number> {
    const legacy = readLegacyCoverOverrides()
    const entries = Object.entries(legacy)
    if (entries.length === 0) {
        return 0
    }
    const { migrateLegacyCover } = await import("@/lib/local/cover")
    let count = 0
    await ensureCoverOverridesLoaded()
    for (const [trackId, dataUrl] of entries) {
        if (cache[trackId]) {
            continue
        }
        try {
            const cached = await migrateLegacyCover(dataUrl)
            cache[trackId] = cached
            count += 1
        } catch {
            // 迁移失败保留旧 base64，但不清除
        }
    }
    if (count > 0) {
        await writeMap(cache)
    }
    return count
}

export {
    clearCoverOverride,
    clearLegacyCoverOverrides,
    COVER_OVERRIDE_EVENT,
    ensureCoverOverridesLoaded,
    getCoverOverride,
    migrateLegacyOverrides,
    resolveTrackCoverUrl,
    setCoverOverride,
}