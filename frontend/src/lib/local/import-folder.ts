import { invoke } from "@tauri-apps/api/core"

import { pickSafFiles, pickSafFolder } from "@/lib/android/native-bridge"
import { upsertLibraryFolder, upsertLibraryTracks } from "@/lib/db/play-stats"
import { fileStemFromPath, stripExtension } from "@/lib/local/audio-formats"
import { isAndroid } from "@/lib/platform"
import {
    CURRENT_METADATA_VERSION,
    createEmptyAlbum,
    loadLocalLibrary,
    mergeFolderScan,
    mergeScannedTrackMeta,
    mergeScannedTracks,
    toAssetUrl,
    upsertArtist,
    type AlbumDraft,
    type LocalAlbum,
    type LocalArtist,
    type LocalLibraryState,
    type ScanTrackDto,
} from "@/lib/local/library-store"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function pickMusicFolder(): Promise<string | null> {
    if (isAndroid()) {
        // SAF 复制进应用私有目录后返回本地路径，复用桌面扫描链路
        return pickSafFolder()
    }
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    return invoke<string | null>("pick_music_folder")
}

async function pickMusicFiles(): Promise<string[] | null> {
    if (isAndroid()) {
        return pickSafFiles()
    }
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    return invoke<string[] | null>("pick_music_files")
}

async function scanMusicFolder(path: string): Promise<ScanTrackDto[]> {
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    return invoke<ScanTrackDto[]>("scan_music_folder", { path })
}

async function scanMusicFiles(paths: string[]): Promise<ScanTrackDto[]> {
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    if (paths.length === 0) {
        return []
    }
    return invoke<ScanTrackDto[]>("scan_music_files", { paths })
}

type ArtistScanResultDto = {
    displayName: string
    groupFolders: string[]
    tracks: ScanTrackDto[]
}

async function scanMusicArtistFolder(path: string): Promise<ArtistScanResultDto> {
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }
    return invoke<ArtistScanResultDto>("scan_music_artist_folder", { path })
}

function pathBelongsToFolder(filePath: string, folderPath: string): boolean {
    const file = filePath.replace(/\\/g, "/")
    const folder = folderPath.replace(/\\/g, "/").replace(/\/+$/, "")
    if (file === folder) {
        return true
    }
    return file.startsWith(folder + "/")
}

function parentFolderOfNative(filePath: string): string {
    const idx = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"))
    return idx > 0 ? filePath.slice(0, idx) : ""
}

/**
 * 导入「艺人文件夹」：直接子文件夹 = 专辑，根目录散曲自建「精选」专辑。
 * 复用合并逻辑，每个子文件夹单独成专辑并关联艺人。
 */
async function commitArtistFolder(input: {
    folderPath: string
    artistName?: string
    coverDataUrl?: string
}): Promise<{ state: LocalLibraryState; artist: LocalArtist; added: number }> {
    const folderPath = input.folderPath?.trim()
    if (!folderPath) {
        throw new Error("请选择艺人文件夹")
    }
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }

    const scannedResult = await scanMusicArtistFolder(folderPath)
    const tracks = scannedResult.tracks
    const groupFolders = scannedResult.groupFolders

    const prev = loadLocalLibrary()
    const existingIds = new Set(prev.tracks.map((track) => track.id))

    // 1. 创建 / 复用艺人分组（folderPath 相同视为同一艺人）
    const { state: withArtist, artist } = upsertArtist(prev, {
        name: input.artistName?.trim() || scannedResult.displayName,
        folderPath,
        coverDataUrl: input.coverDataUrl ?? "",
    })
    let state = withArtist

    // 2. 根目录散曲 → 自建「精选」专辑（同时自然进入全部歌曲）
    const rootPathNorm = folderPath.replace(/[\\/]+$/, "")
    const rootTracks = tracks.filter((track) => {
        const parent = parentFolderOfNative(track.path)
        if (!parent) {
            return false
        }
        const parentNorm = parent.replace(/[\\/]+$/, "")
        return parentNorm === rootPathNorm
    })
    if (rootTracks.length > 0) {
        state = mergeFolderScan(
            state,
            folderPath,
            rootTracks,
            {
                title: `${artist.name} 精选`,
                artist: artist.name,
                coverDataUrl: "",
                folderPath,
                artistId: artist.id,
            },
            null,
        )
    }

    // 3. 每个直接子文件夹 → 一个专辑
    for (const group of groupFolders) {
        const groupTracks = tracks.filter((track) =>
            pathBelongsToFolder(track.path, group),
        )
        if (groupTracks.length === 0) {
            continue
        }
        state = mergeFolderScan(
            state,
            group,
            groupTracks,
            {
                title: "",
                artist: artist.name,
                coverDataUrl: "",
                folderPath: group,
                artistId: artist.id,
            },
            null,
        )
    }

    const added = tracks.filter((track) => !existingIds.has(track.id)).length
    return { state, artist, added }
}

export type CommitAlbumInput = AlbumDraft & {
    albumId?: string | null
}

export type CommitAlbumResult = {
    state: LocalLibraryState
    album: LocalAlbum
    added: number
}

export type CommitFilesResult = {
    state: LocalLibraryState
    /** 目标专辑；null 表示仅进全部歌曲 */
    album: LocalAlbum | null
    added: number
}

function commitCreateAlbum(draft: AlbumDraft): CommitAlbumResult {
    const { state, album } = createEmptyAlbum(draft)
    return { state, album, added: 0 }
}

/**
 * 确认导入 扫描元数据写入本地库与 SQLite
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
 * 选择任意路径音频加入资料库。
 * @param albumId 指定专辑；省略则仅进「全部歌曲」
 * @param paths 已选路径；省略则弹系统多选
 */
async function commitMusicFiles(options?: {
    albumId?: string | null
    paths?: string[]
}): Promise<CommitFilesResult> {
    if (!isTauriRuntime()) {
        throw new Error("DESKTOP_ONLY")
    }

    let paths = options?.paths?.filter((p) => p.trim()) ?? null
    if (!paths) {
        paths = await pickMusicFiles()
    }
    if (!paths || paths.length === 0) {
        throw new Error("CANCELLED")
    }

    const scanned = await scanMusicFiles(paths)
    if (scanned.length === 0) {
        const prev = loadLocalLibrary()
        const album =
            options?.albumId != null
                ? prev.albums.find((item) => item.id === options.albumId) ?? null
                : null
        return { state: prev, album, added: 0 }
    }

    const albumId = options?.albumId ?? null
    const prev = loadLocalLibrary()
    const existingIds = new Set(prev.tracks.map((track) => track.id))
    const state = mergeScannedTracks(prev, scanned, albumId)
    const album =
        albumId != null
            ? state.albums.find((item) => item.id === albumId) ?? null
            : null

    void dualWriteTracksToSqlite(scanned, album)

    return {
        state,
        album,
        // 重复选择同一文件时不再提示“新增”，更符合用户预期
        added: scanned.filter((item) => !existingIds.has(item.id)).length,
    }
}

let metaRescanInFlight: Promise<LocalLibraryState> | null = null

/**
 * 旧版本曲库只补扫缺少内容指纹的文件，不再按专辑全量重扫。
 * 无封面或无歌词是有效状态，不能作为“未扫描”依据。
 */
function rescanLocalLibraryMeta(
    prev: LocalLibraryState = loadLocalLibrary(),
): Promise<LocalLibraryState> {
    if (!isTauriRuntime()) {
        return Promise.resolve(prev)
    }
    if (metaRescanInFlight) {
        return metaRescanInFlight
    }

    metaRescanInFlight = rescanMissingTrackMeta(prev).finally(() => {
        metaRescanInFlight = null
    })
    return metaRescanInFlight
}

async function rescanMissingTrackMeta(
    prev: LocalLibraryState,
): Promise<LocalLibraryState> {
    const pending = prev.tracks.filter(
        (track) => track.metadataVersion < CURRENT_METADATA_VERSION,
    )
    const paths = pending.map((track) => track.path)
    if (paths.length === 0) {
        return prev
    }

    const scanned = await scanMusicFiles(paths)
    const state = mergeScannedTrackMeta(
        prev,
        scanned,
        new Set(pending.map((track) => track.id)),
    )

    const albumById = new Map(state.albums.map((album) => [album.id, album]))
    const trackById = new Map(state.tracks.map((track) => [track.id, track]))
    const grouped = new Map<string, ScanTrackDto[]>()
    for (const item of scanned) {
        const stored = trackById.get(item.id)
        if (!stored?.albumId) {
            continue
        }
        const items = grouped.get(stored.albumId) ?? []
        items.push(item)
        grouped.set(stored.albumId, items)
    }
    for (const [albumId, items] of grouped) {
        void dualWriteTracksToSqlite(items, albumById.get(albumId) ?? null)
    }

    return state
}

let coverRepairInFlight: Promise<LocalLibraryState> | null = null
let lastCoverRepairAt = 0

/**
 * 本地封面缓存自愈：封面缓存被清理后，曲库条目里的 coverPath 仍指向已删除的
 * originals/{hash}.<ext>，渲染层 404。这里批量对账磁盘，对失效条目重新解析
 * 原音频文件提取封面（Rust 侧按内容 MD5 幂等写盘），合并回曲库并广播。
 * 非强制调用带 30s 冷却，避免多张图同时 404 引发重复重扫。
 */
async function reextractLocalCovers(
    options: { force?: boolean } = {},
): Promise<LocalLibraryState> {
    const prev = loadLocalLibrary()
    if (!isTauriRuntime()) {
        return prev
    }
    if (coverRepairInFlight) {
        return coverRepairInFlight
    }
    if (!options.force && Date.now() - lastCoverRepairAt < 30_000) {
        return prev
    }

    coverRepairInFlight = repairMissingLocalCovers(prev).finally(() => {
        coverRepairInFlight = null
    })
    return coverRepairInFlight
}

async function repairMissingLocalCovers(
    prev: LocalLibraryState,
): Promise<LocalLibraryState> {
    lastCoverRepairAt = Date.now()
    const candidates = prev.tracks.filter((track) => track.coverPath)
    if (candidates.length === 0) {
        return prev
    }

    let exist: boolean[]
    try {
        exist = await invoke<boolean[]>("cover_paths_exist", {
            paths: candidates.map((track) => track.coverPath),
        })
    } catch {
        return prev
    }
    const dead = candidates.filter((_, index) => exist[index] === false)
    if (dead.length === 0) {
        return prev
    }

    const scanned = await scanMusicFiles(dead.map((track) => track.path))
    const state = mergeScannedTrackMeta(
        prev,
        scanned,
        new Set(dead.map((track) => track.id)),
    )

    // 同步 SQLite 双写，保持与扫描导入链路一致
    const albumById = new Map(state.albums.map((album) => [album.id, album]))
    const trackById = new Map(state.tracks.map((track) => [track.id, track]))
    const grouped = new Map<string, ScanTrackDto[]>()
    for (const item of scanned) {
        const stored = trackById.get(item.id)
        if (!stored?.albumId) {
            continue
        }
        const items = grouped.get(stored.albumId) ?? []
        items.push(item)
        grouped.set(stored.albumId, items)
    }
    for (const [albumId, items] of grouped) {
        void dualWriteTracksToSqlite(items, albumById.get(albumId) ?? null)
    }

    return state
}

function libraryNeedsMetaRescan(state: LocalLibraryState): boolean {
    return state.tracks.some(
        (track) => track.metadataVersion < CURRENT_METADATA_VERSION,
    )
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
    }).then(() => dualWriteTracksToSqlite(scanned, album, folderPath))
}

function dualWriteTracksToSqlite(
    scanned: ScanTrackDto[],
    album: LocalAlbum | null,
    folderPathFallback?: string,
): void {
    void upsertLibraryTracks(
        scanned.map((item) => {
            const parent =
                item.path.includes("\\")
                    ? item.path.slice(
                          0,
                          Math.max(
                              item.path.lastIndexOf("\\"),
                              item.path.lastIndexOf("/"),
                          ),
                      )
                    : item.path.replace(/\\/g, "/").replace(/\/[^/]+$/, "")
            return {
                id: item.id,
                source: "local",
                title: item.title,
                artist:
                    item.artist && item.artist !== "未知艺人"
                        ? item.artist
                        : album?.artist || item.artist || "未知艺人",
                album:
                    item.album && item.album !== "本地文件"
                        ? item.album
                        : album?.title || item.album || "本地文件",
                durationMs: item.durationMs ?? 0,
                coverUrl:
                    toAssetUrl(item.coverPath) || album?.coverDataUrl || null,
                filePath: item.path,
                folderPath: folderPathFallback || parent || null,
                lrcPath: item.lrcPath ?? null,
                fileName:
                    stripExtension(item.fileName?.trim() || "") ||
                    fileStemFromPath(item.path) ||
                    null,
                contentHash: item.contentHash?.trim().toLowerCase() || null,
            }
        }),
    )
}

export {
    commitArtistFolder,
    commitCreateAlbum,
    commitFolderAlbum,
    commitMusicFiles,
    isTauriRuntime,
    libraryNeedsMetaRescan,
    pickMusicFiles,
    pickMusicFolder,
    reextractLocalCovers,
    rescanLocalLibraryMeta,
    scanMusicFiles,
    scanMusicFolder,
}