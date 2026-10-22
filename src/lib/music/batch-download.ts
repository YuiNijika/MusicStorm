import { invoke } from "@tauri-apps/api/core"

import { resolvePlayableUrl } from "@/lib/music/resolve-url"
import { isAndroid, isTauriRuntime } from "@/lib/platform"
import type { Track } from "@/lib/types"

type PlaylistDownloadProgress = {
    total: number
    completed: number
    succeeded: number
    failed: number
    skipped: number
    currentTitle?: string
}

type PlaylistDownloadFailure = {
    title: string
    reason: string
}

type PlaylistDownloadResult = PlaylistDownloadProgress & {
    directory: string
    failures: PlaylistDownloadFailure[]
}

type DownloadPlaylistInput = {
    tracks: Track[]
    directory: string
    onProgress?: (progress: PlaylistDownloadProgress) => void
}

const DOWNLOAD_CONCURRENCY = 3
const MAX_REPORTED_FAILURES = 50
const MAX_FILE_STEM_LENGTH = 150

function canBatchDownload(): boolean {
    return isTauriRuntime() && !isAndroid()
}

async function chooseDownloadDirectory(): Promise<string | null> {
    if (!canBatchDownload()) {
        throw new Error("批量下载仅支持桌面应用")
    }
    return invoke<string | null>("pick_download_folder")
}

function extensionFromUrl(url: string): string {
    try {
        const path = new URL(url).pathname
        const match = /\.([a-z0-9]{2,5})$/i.exec(path)
        return match?.[1]?.toLowerCase() ?? "mp3"
    } catch {
        return "mp3"
    }
}

function extensionForResolved(input: {
    filePath?: string
    url: string
}): string {
    if (input.filePath) {
        const match = /\.([a-z0-9]{2,5})$/i.exec(input.filePath)
        if (match?.[1]) {
            return match[1].toLowerCase()
        }
    }
    return extensionFromUrl(input.url)
}

function fileNameForTrack(
    track: Track,
    extension: string,
    usedNames: Map<string, number>,
): string {
    const base =
        `${track.artist || "未知艺人"} - ${track.title || track.id}`
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, MAX_FILE_STEM_LENGTH)
    const stem = base || track.id
    const count = (usedNames.get(stem) ?? 0) + 1
    usedNames.set(stem, count)
    return `${stem}${count > 1 ? ` (${count})` : ""}.${extension}`
}

async function downloadPlaylistTracks(
    input: DownloadPlaylistInput,
): Promise<PlaylistDownloadResult> {
    if (!canBatchDownload()) {
        throw new Error("批量下载仅支持桌面应用")
    }

    const unique = new Map<string, Track>()
    for (const track of input.tracks) {
        if (track.source === "netease") {
            unique.set(track.id, track)
        }
    }

    const queue = [...unique.values()]
    const skipped = Math.max(0, input.tracks.length - queue.length)
    const failures: PlaylistDownloadFailure[] = []
    const usedNames = new Map<string, number>()
    let nextIndex = 0
    let completed = 0
    let succeeded = 0
    let failed = 0

    const report = (currentTitle?: string) => {
        try {
            input.onProgress?.({
                total: queue.length,
                completed,
                succeeded,
                failed,
                skipped,
                currentTitle,
            })
        } catch {
            // Progress rendering must not stop the download queue
        }
    }
    report()

    async function worker() {
        while (true) {
            const current = nextIndex
            nextIndex += 1
            const track = queue[current]
            if (!track) {
                return
            }

            report(track.title)
            try {
                const resolved = await resolvePlayableUrl(track)
                if (!resolved.ok) {
                    throw new Error(resolved.reason)
                }
                const extension = extensionForResolved({
                    filePath: resolved.filePath,
                    url: resolved.url,
                })
                await invoke<string>("save_audio_to_directory", {
                    directory: input.directory,
                    defaultName: fileNameForTrack(
                        track,
                        extension,
                        usedNames,
                    ),
                    url: resolved.filePath ? null : resolved.url,
                    sourcePath: resolved.filePath ?? null,
                })
                succeeded += 1
            } catch (error) {
                failed += 1
                if (failures.length < MAX_REPORTED_FAILURES) {
                    failures.push({
                        title: track.title,
                        reason:
                            error instanceof Error
                                ? error.message
                                : "下载失败",
                    })
                }
            } finally {
                completed += 1
                report()
            }
        }
    }

    await Promise.all(
        Array.from(
            {
                length: Math.min(
                    DOWNLOAD_CONCURRENCY,
                    Math.max(1, queue.length),
                ),
            },
            () => worker(),
        ),
    )

    const finalProgress = {
        total: queue.length,
        completed,
        succeeded,
        failed,
        skipped,
    }
    return {
        ...finalProgress,
        directory: input.directory,
        failures,
    }
}

export {
    canBatchDownload,
    chooseDownloadDirectory,
    downloadPlaylistTracks,
}
export type {
    PlaylistDownloadFailure,
    PlaylistDownloadProgress,
    PlaylistDownloadResult,
}
