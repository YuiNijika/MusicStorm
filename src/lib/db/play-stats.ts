import { invoke } from "@tauri-apps/api/core"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

type UpsertFolderInput = {
    path: string
    displayName?: string
    trackCount: number
    artist?: string | null
    /** data:image/...;base64,... 写入 library_folder.cover_data */
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
}

type PlaySessionStart = {
    id: string
    trackId: string
    source: string
    startedAt: number
    qualityBr?: number | null
}

type PlaySessionEnd = {
    id: string
    trackId: string
    source: string
    startedAt: number
    endedAt: number
    listenedMs: number
    completed: boolean
    qualityBr?: number | null
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
        // ignore
    }
}

async function recordPlaySessionEnd(input: PlaySessionEnd): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    try {
        await invoke("db_end_play_session", { input })
    } catch {
        // ignore
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
        // ignore
    }
}

export {
    dbGetSetting,
    dbSetSetting,
    recordPlaySessionEnd,
    startPlaySession,
    upsertLibraryFolder,
    upsertLibraryTracks,
}
export type { PlaySessionEnd, PlaySessionStart, UpsertFolderInput, UpsertTrackInput }