import { invoke } from "@tauri-apps/api/core"

import { upsertLibraryFolder, upsertLibraryTracks } from "@/lib/db/play-stats"
import { fileStemFromPath, stripExtension } from "@/lib/local/audio-formats"
import {
    createEmptyAlbum,
    loadLocalLibrary,
    mergeFolderScan,
    toAssetUrl,
    type AlbumDraft,
    type LocalAlbum,
    type LocalLibraryState,
    type ScanTrackDto,
} from "@/lib/local/library-store"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function pickMusicFolder(): Promise<string | null> {
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    return invoke<string | null>("pick_music_folder")
}

async function scanMusicFolder(path: string): Promise<ScanTrackDto[]> {
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    return invoke<ScanTrackDto[]>("scan_music_folder", { path })
}

export type CommitAlbumInput = AlbumDraft & {
    albumId?: string | null
}

export type CommitAlbumResult = {
    state: LocalLibraryState
    album: LocalAlbum
    added: number
}

function commitCreateAlbum(draft: AlbumDraft): CommitAlbumResult {
    const { state, album } = createEmptyAlbum(draft)
    return { state, album, added: 0 }
}

/**
 * 确认导入：扫描元数据写入本地库与 SQLite
 * 标题艺人可空，merge 内从标签多数表决
 */
async function commitFolderAlbum(input: CommitAlbumInput): Promise<CommitAlbumResult> {
    const folderPath = input.folderPath?.trim()
    if (!folderPath) {
        return commitCreateAlbum(input)
    }

    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }

    const scanned = await scanMusicFolder(folderPath)
    const prev = loadLocalLibrary()
    const draft: AlbumDraft = {
        title: input.title.trim(),
        artist: input.artist.trim(),
        coverDataUrl: input.coverDataUrl,
        folderPath,
    }
    const state = mergeFolderScan(prev, folderPath, scanned, draft, input.albumId)
    const album =
        state.albums.find((item) => item.folderPath === folderPath) ?? state.albums[0]!

    void dualWriteToSqlite(folderPath, album, scanned)

    return {
        state,
        album,
        added: scanned.length,
    }
}

/**
 * 对已有专辑文件夹重新扫描封面、歌词、时长，不改用户手动封面
 */
async function rescanLocalLibraryMeta(
    prev: LocalLibraryState = loadLocalLibrary(),
): Promise<LocalLibraryState> {
    if (!isTauriRuntime()) {
        return prev
    }

    let state = prev
    const albums = prev.albums.filter((album) => album.folderPath)

    for (const album of albums) {
        const folderPath = album.folderPath!
        try {
            const scanned = await scanMusicFolder(folderPath)
            state = mergeFolderScan(
                state,
                folderPath,
                scanned,
                {
                    title: album.title,
                    artist: album.artist,
                    // 保留手动 data: 封面；asset 兜底不算手动
                    coverDataUrl: album.coverDataUrl.startsWith("data:")
                        ? album.coverDataUrl
                        : "",
                    folderPath,
                },
                album.id,
            )
            void dualWriteToSqlite(folderPath, album, scanned)
        } catch {
            // 单文件夹失败不阻断其余
        }
    }

    return state
}

function libraryNeedsMetaRescan(state: LocalLibraryState): boolean {
    if (state.tracks.length === 0) {
        return false
    }
    // 旧导入：无封面/歌词，或缺少内容指纹
    const missing = state.tracks.filter(
        (t) =>
            (!t.coverPath && !t.lrcPath && !t.lyricText) ||
            !t.contentHash,
    )
    return missing.length >= Math.max(1, Math.floor(state.tracks.length * 0.5))
}

function dualWriteToSqlite(
    folderPath: string,
    album: LocalAlbum,
    scanned: ScanTrackDto[],
): void {
    void upsertLibraryFolder({
        path: folderPath,
        displayName: album.title,
        trackCount: scanned.length,
        artist: album.artist,
        coverData: album.coverDataUrl || null,
    }).then(() =>
        upsertLibraryTracks(
            scanned.map((item) => ({
                id: item.id,
                source: "local",
                title: item.title,
                artist:
                    item.artist && item.artist !== "未知艺人"
                        ? item.artist
                        : album.artist || item.artist || "未知艺人",
                album:
                    item.album && item.album !== "本地文件" ? item.album : album.title,
                durationMs: item.durationMs ?? 0,
                // 曲目内嵌封面 asset URL；否则专辑手动 base64
                coverUrl:
                    toAssetUrl(item.coverPath) || album.coverDataUrl || null,
                filePath: item.path,
                folderPath,
                lrcPath: item.lrcPath ?? null,
                fileName:
                    stripExtension(item.fileName?.trim() || "") ||
                    fileStemFromPath(item.path) ||
                    null,
                contentHash: item.contentHash?.trim().toLowerCase() || null,
            })),
        ),
    )
}

export {
    commitCreateAlbum,
    commitFolderAlbum,
    isTauriRuntime,
    libraryNeedsMetaRescan,
    pickMusicFolder,
    rescanLocalLibraryMeta,
    scanMusicFolder,
}