import { invoke } from "@tauri-apps/api/core"

import { fileStemFromPath, stripExtension } from "@/lib/local/audio-formats"
import { fetchSongDetail } from "@/lib/netease/track"
import type { MusicSource, Track } from "@/lib/types"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

type UpsertFolderInput = {
    path: string
    displayName?: string
    trackCount: number
    artist?: string | null
    /** base64 封面，写入 library_folder.cover_data */
    coverData?: string | null
}

type UpsertTrackInput = {
    id: string
    source: string
    title: string
    artist: string
    album: string
    durationMs: number
    coverUrl?: string | null
    filePath?: string | null
    folderPath?: string | null
    lrcPath?: string | null
    fileName?: string | null
    contentHash?: string | null
}

type PlaySessionMeta = {
    title?: string | null
    artist?: string | null
    album?: string | null
    filePath?: string | null
    fileName?: string | null
    contentHash?: string | null
    coverUrl?: string | null
}

type PlaySessionStart = {
    id: string
    trackId: string
    source: string
    startedAt: number
    qualityBr?: number | null
} & PlaySessionMeta

type PlaySessionEnd = {
    id: string
    trackId: string
    source: string
    startedAt: number
    endedAt: number
    listenedMs: number
    completed: boolean
    qualityBr?: number | null
} & PlaySessionMeta

type ListenStats = {
    day: string
    playCount: number
    uniqueTracks: number
    totalMs: number
}

type ListenSourceStat = {
    source: string
    playCount: number
    totalMs: number
}

/** 后端按 track_id 聚合的一行 */
type TopTrackStat = {
    trackId: string
    source: string
    title: string
    artist: string
    album: string
    coverUrl?: string | null
    filePath?: string | null
    fileName?: string | null
    contentHash?: string | null
    playCount: number
    totalMs: number
    durationMs?: number
}

/** 默认展示：同 MD5 或同文件名归为一组 */
type TopTrackCluster = {
    key: string
    title: string
    artist: string
    album: string
    source: string
    coverUrl?: string
    playCount: number
    totalMs: number
    durationMs: number
    memberCount: number
    /** 分别记录，仅详情展开 */
    members: TopTrackStat[]
}

/** 路径或旧库带后缀名转为无扩展名归类键 */
function fileBaseName(path: string | null | undefined): string | null {
    if (!path) {
        return null
    }
    const stem = fileStemFromPath(path)
    if (stem) {
        return stem
    }
    const trimmed = path.trim()
    return stripExtension(trimmed) || null
}

function needsNeteaseEnrich(row: TopTrackStat): boolean {
    if (row.source !== "netease") {
        return false
    }
    const title = row.title?.trim() ?? ""
    const cover = row.coverUrl?.trim() ?? ""
    const artist = row.artist?.trim() ?? ""
    return !cover || !title || title === row.trackId || !artist
}

/** 历史网易云会话缺封面/歌名时批量 song/detail，并写回 track 表 */
async function enrichTopTrackStats(rows: TopTrackStat[]): Promise<TopTrackStat[]> {
    const need = rows.filter(needsNeteaseEnrich)
    if (need.length === 0) {
        return rows
    }

    const ids = [...new Set(need.map((r) => r.trackId).filter(Boolean))]
    if (ids.length === 0) {
        return rows
    }

    try {
        const res = await fetchSongDetail(ids.join(","))
        const songs = res.songs ?? []
        if (songs.length === 0) {
            return rows
        }

        const byId = new Map(
            songs.map((s) => [
                String(s.id),
                {
                    title: s.name || "",
                    artist: s.ar?.map((a) => a.name).filter(Boolean).join(" / ") || "",
                    album: s.al?.name || "",
                    coverUrl: s.al?.picUrl || "",
                    durationMs: typeof s.dt === "number" ? s.dt : 0,
                },
            ]),
        )

        const upserts: UpsertTrackInput[] = []
        const next = rows.map((row) => {
            if (!needsNeteaseEnrich(row)) {
                return row
            }
            const hit = byId.get(row.trackId)
            if (!hit) {
                return row
            }
            const merged: TopTrackStat = {
                ...row,
                title: hit.title || row.title,
                artist: hit.artist || row.artist,
                album: hit.album || row.album,
                coverUrl: hit.coverUrl || row.coverUrl,
                durationMs: hit.durationMs || row.durationMs || 0,
            }
            if (hit.title) {
                upserts.push({
                    id: row.trackId,
                    source: "netease",
                    title: merged.title,
                    artist: merged.artist,
                    album: merged.album,
                    durationMs: merged.durationMs ?? 0,
                    coverUrl: merged.coverUrl ?? null,
                })
            }
            return merged
        })

        if (upserts.length > 0) {
            void upsertLibraryTracks(upserts)
        }
        return next
    } catch {
        return rows
    }
}

/** 本地按 MD5 或无后缀文件名并集归类；网易云按 trackId */
function clusterTopTracks(rows: TopTrackStat[]): TopTrackCluster[] {
    if (rows.length === 0) {
        return []
    }

    const parent = new Map<string, string>()
    const find = (id: string): string => {
        const p = parent.get(id) ?? id
        if (p !== id) {
            const root = find(p)
            parent.set(id, root)
            return root
        }
        return p
    }
    const union = (a: string, b: string) => {
        const pa = find(a)
        const pb = find(b)
        if (pa !== pb) {
            parent.set(pa, pb)
        }
    }

    for (const row of rows) {
        parent.set(row.trackId, row.trackId)
    }

    const byHash = new Map<string, string>()
    const byName = new Map<string, string>()

    for (const row of rows) {
        if (row.source !== "local") {
            continue
        }
        const hash = row.contentHash?.trim().toLowerCase()
        if (hash) {
            const prev = byHash.get(hash)
            if (prev) {
                union(row.trackId, prev)
            } else {
                byHash.set(hash, row.trackId)
            }
        }
        const name = stripExtension(
            row.fileName?.trim() || fileBaseName(row.filePath) || "",
        ).toLowerCase()
        if (name) {
            const prev = byName.get(name)
            if (prev) {
                union(row.trackId, prev)
            } else {
                byName.set(name, row.trackId)
            }
        }
    }

    const groups = new Map<string, TopTrackStat[]>()
    for (const row of rows) {
        const root = find(row.trackId)
        const list = groups.get(root) ?? []
        list.push(row)
        groups.set(root, list)
    }

    const clusters: TopTrackCluster[] = []
    for (const [root, members] of groups) {
        members.sort(
            (a, b) =>
                b.playCount - a.playCount ||
                b.totalMs - a.totalMs ||
                a.trackId.localeCompare(b.trackId),
        )
        const primary = members[0]!
        const playCount = members.reduce((sum, m) => sum + m.playCount, 0)
        const totalMs = members.reduce((sum, m) => sum + m.totalMs, 0)
        clusters.push({
            key: root,
            title: primary.title,
            artist: primary.artist,
            album: primary.album,
            source: primary.source,
            coverUrl: primary.coverUrl || undefined,
            playCount,
            totalMs,
            durationMs: primary.durationMs ?? 0,
            memberCount: members.length,
            members,
        })
    }

    clusters.sort(
        (a, b) =>
            b.playCount - a.playCount ||
            b.totalMs - a.totalMs ||
            a.title.localeCompare(b.title, "zh-CN"),
    )
    return clusters
}

/** 统计行 → 可播放 Track */
function clusterToTrack(cluster: TopTrackCluster): Track {
    const primary = cluster.members[0]
    const source = (cluster.source === "local" ? "local" : "netease") as MusicSource
    return {
        id: primary?.trackId ?? cluster.key,
        title: cluster.title,
        artist: cluster.artist || "未知艺人",
        album: cluster.album || "",
        coverUrl: cluster.coverUrl || "",
        durationMs: cluster.durationMs || primary?.durationMs || 0,
        source,
        filePath: primary?.filePath || undefined,
        fileName: primary?.fileName || undefined,
        contentHash: primary?.contentHash || undefined,
    }
}

async function upsertLibraryFolder(input: UpsertFolderInput): Promise<string | null> {
    if (!isTauriRuntime()) {
        return null
    }
    try {
        return await invoke<string>("db_upsert_folder", { input })
    } catch {
        return null
    }
}

async function upsertLibraryTracks(tracks: UpsertTrackInput[]): Promise<void> {
    if (!isTauriRuntime() || tracks.length === 0) {
        return
    }
    try {
        await invoke("db_upsert_tracks", { tracks })
    } catch {
        // 统计失败不影响播放/导入
    }
}

async function startPlaySession(input: PlaySessionStart): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    try {
        await invoke("db_start_play_session", { input })
    } catch {
        // 统计失败不影响播放
    }
}

async function recordPlaySessionEnd(input: PlaySessionEnd): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    try {
        await invoke("db_end_play_session", { input })
    } catch {
        // 统计失败不影响播放
    }
}

async function getListenStats(day?: string): Promise<ListenStats | null> {
    if (!isTauriRuntime()) {
        return null
    }
    try {
        return await invoke<ListenStats | null>("db_get_listen_stats", {
            day: day ?? null,
        })
    } catch {
        return null
    }
}

async function listListenStats(
    days = 7,
    fromDay?: string,
    toDay?: string,
): Promise<ListenStats[]> {
    if (!isTauriRuntime()) {
        return []
    }
    try {
        return await invoke<ListenStats[]>("db_list_listen_stats", {
            days,
            fromDay,
            toDay,
        })
    } catch {
        return []
    }
}

async function listListenSourceBreakdown(
    days: number | null = null,
    fromDay?: string,
    toDay?: string,
): Promise<ListenSourceStat[]> {
    if (!isTauriRuntime()) {
        return []
    }
    try {
        return await invoke<ListenSourceStat[]>("db_listen_source_breakdown", {
            days: days && days > 0 ? days : null,
            fromDay,
            toDay,
        })
    } catch {
        return []
    }
}

/**
 * 拉取 top tracks 并做本地归类。
 * 网易云缺元数据时批量补齐。
 */
async function listTopTrackClusters(
    limit = 20,
    days: number | null = null,
    fromDay?: string,
    toDay?: string,
): Promise<TopTrackCluster[]> {
    if (!isTauriRuntime()) {
        return []
    }
    try {
        const fetchLimit = Math.min(200, Math.max(limit * 4, limit))
        const rows = await invoke<TopTrackStat[]>("db_list_top_tracks", {
            limit: fetchLimit,
            days: days && days > 0 ? days : null,
            fromDay,
            toDay,
        })
        const enriched = await enrichTopTrackStats(rows)
        return clusterTopTracks(enriched).slice(0, limit)
    } catch {
        return []
    }
}

async function dbGetSetting(key: string): Promise<string | null> {
    if (!isTauriRuntime()) {
        return null
    }
    try {
        return await invoke<string | null>("db_get_setting", { key })
    } catch {
        return null
    }
}

async function dbSetSetting(key: string, value: string): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    try {
        await invoke("db_set_setting", { key, value })
    } catch {
        // 设置持久化失败不阻断本次会话
    }
}

export {
    clusterToTrack,
    clusterTopTracks,
    dbGetSetting,
    dbSetSetting,
    fileBaseName,
    getListenStats,
    listListenSourceBreakdown,
    listListenStats,
    listTopTrackClusters,
    recordPlaySessionEnd,
    startPlaySession,
    upsertLibraryFolder,
    upsertLibraryTracks,
}
export type {
    ListenSourceStat,
    ListenStats,
    PlaySessionEnd,
    PlaySessionStart,
    TopTrackCluster,
    TopTrackStat,
    UpsertFolderInput,
    UpsertTrackInput,
}