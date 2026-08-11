import { useCallback, useEffect, useMemo, useState } from "react"

import { usePlayer } from "@/hooks/use-player"
import { notifyWarning } from "@/lib/notify"
import { formatDuration } from "@/lib/format"
import {
    clearWebLibrary,
    estimateWebStorage,
    loadWebLibrary,
    removeWebTrack,
    saveWebTracks,
} from "@/lib/local/web-library"
import {
    revokeWebTrack,
    webImportAudioFiles,
    webImportDirectory,
    type WebLocalTrack,
} from "@/lib/local/web-import"

/**
 * 网页版本地音乐页。
 *
 * 浏览器无文件系统权限：选目录/文件后在内存解析标签，音频本体存入
 * IndexedDB（刷新后自动恢复列表并重建 blob URL 继续播放），数据不落
 * 磁盘文件系统、仅占用浏览器配额。桌面版请下载客户端体验完整曲库。
 */

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function LocalWebPage() {
    const [tracks, setTracks] = useState<WebLocalTrack[]>([])
    const [restoring, setRestoring] = useState(true)
    const [importing, setImporting] = useState(false)
    const [storageLabel, setStorageLabel] = useState("")
    const { currentTrack, isPlaying, playTrack } = usePlayer()

    // 挂载时从 IndexedDB 恢复上次导入的曲目
    useEffect(() => {
        let cancelled = false
        void loadWebLibrary()
            .then((list) => {
                if (!cancelled) {
                    setTracks(list)
                }
            })
            .catch(() => {
                // IDB 不可用：静默降级为空列表，本次会话内存导入
            })
            .finally(() => {
                if (!cancelled) {
                    setRestoring(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    // 曲目变化后刷新浏览器存储占用显示
    useEffect(() => {
        let cancelled = false
        void estimateWebStorage().then((info) => {
            if (cancelled || !info) {
                return
            }
            setStorageLabel(` · 浏览器存储 ${formatBytes(info.usage)}`)
        })
        return () => {
            cancelled = true
        }
    }, [tracks])

    const persistTracks = useCallback(async (list: WebLocalTrack[]) => {
        try {
            await saveWebTracks(list)
        } catch (error) {
            console.warn("[web-local] persist to IndexedDB failed", error)
            notifyWarning("存储空间不足", {
                description: "本次导入仅在内存中播放，刷新页面后需重新导入",
                id: "web-library-quota",
            })
        }
    }, [])

    const importDirectory = useCallback(async () => {
        setImporting(true)
        try {
            const list = await webImportDirectory()
            if (list.length > 0) {
                setTracks((prev) => [...prev, ...list])
                await persistTracks(list)
            }
        } catch (error) {
            console.warn("[web-local] import directory failed", error)
        } finally {
            setImporting(false)
        }
    }, [persistTracks])

    const importFiles = useCallback(async () => {
        setImporting(true)
        try {
            const list = await webImportAudioFiles()
            if (list.length > 0) {
                setTracks((prev) => [...prev, ...list])
                await persistTracks(list)
            }
        } catch (error) {
            console.warn("[web-local] import files failed", error)
        } finally {
            setImporting(false)
        }
    }, [persistTracks])

    const removeTrack = useCallback((track: WebLocalTrack) => {
        setTracks((prev) => prev.filter((item) => item.id !== track.id))
        revokeWebTrack(track)
        void removeWebTrack(track.id).catch((error) =>
            console.warn("[web-local] remove from IndexedDB failed", error),
        )
    }, [])

    const clearLibrary = useCallback(async () => {
        if (!window.confirm("清空浏览器中保存的全部本地音乐？")) {
            return
        }
        // 先 revoke 内存中的 blob URL，再清空 IndexedDB
        tracks.forEach(revokeWebTrack)
        setTracks([])
        try {
            await clearWebLibrary()
        } catch (error) {
            console.warn("[web-local] clear IndexedDB failed", error)
        }
    }, [tracks])

    const totalMs = useMemo(
        () => tracks.reduce((sum, track) => sum + track.durationMs, 0),
        [tracks],
    )

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
                        本地音乐
                    </h1>
                    <p className="mt-1 max-w-[46rem] text-[13px] leading-relaxed text-muted-foreground">
                        网页版无文件系统权限：音乐在浏览器内解析并存入 IndexedDB
                        （占用浏览器存储配额），刷新后可自动恢复继续播放；
                        桌面版支持完整本地曲库管理。
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void importDirectory()}
                        disabled={importing || restoring}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-transform duration-100 active:scale-[0.97] disabled:opacity-50"
                    >
                        {importing ? "解析中…" : "选择文件夹"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void importFiles()}
                        disabled={importing || restoring}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-black/[0.06] px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-black/[0.1] active:scale-[0.97] disabled:opacity-50 dark:bg-white/[0.08] dark:hover:bg-white/[0.14]"
                    >
                        选择音频文件
                    </button>
                </div>
            </div>

            {restoring ? (
                <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center dark:border-white/[0.16]">
                    <p className="text-[14px] text-muted-foreground">
                        正在从 IndexedDB 恢复本地音乐…
                    </p>
                </div>
            ) : tracks.length > 0 ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] text-muted-foreground">
                            {tracks.length} 首 · 共 {formatDuration(totalMs)}
                            {storageLabel}
                        </p>
                        <button
                            type="button"
                            onClick={() => void clearLibrary()}
                            className="shrink-0 rounded-full px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]"
                        >
                            清空存储
                        </button>
                    </div>
                    <div className="space-y-0.5">
                        {tracks.map((track) => {
                            const active =
                                currentTrack?.id === track.id && isPlaying
                            return (
                                <div
                                    key={track.id}
                                    className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                                    onClick={() =>
                                        playTrack(track, tracks)
                                    }
                                >
                                    <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-black/[0.06] dark:bg-white/[0.08]">
                                        {track.coverUrl ? (
                                            <img
                                                src={track.coverUrl}
                                                alt=""
                                                className="size-full object-cover"
                                            />
                                        ) : null}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={
                                                active
                                                    ? "truncate text-[14px] font-medium text-accent"
                                                    : "truncate text-[14px] font-medium text-foreground"
                                            }
                                        >
                                            {track.title}
                                        </p>
                                        <p className="truncate text-[12px] text-muted-foreground">
                                            {track.artist}
                                            {track.album
                                                ? ` · ${track.album}`
                                                : ""}
                                        </p>
                                    </div>
                                    <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
                                        {formatDuration(track.durationMs)}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`移除 ${track.title}`}
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            removeTrack(track)
                                        }}
                                        className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-black/[0.06] hover:text-foreground group-hover:opacity-100 dark:hover:bg-white/[0.1]"
                                    >
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            aria-hidden="true"
                                        >
                                            <path d="M6 6l12 12M18 6L6 18" />
                                        </svg>
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center dark:border-white/[0.16]">
                    <p className="text-[15px] font-medium text-foreground">
                        还没有本地音乐
                    </p>
                    <p className="max-w-[28rem] text-[13px] leading-relaxed text-muted-foreground">
                        选择音乐文件夹或音频文件开始播放，支持 MP3 / FLAC / WAV /
                        M4A / OGG 等常见格式，标签（歌名、艺人、封面）自动解析。
                        音乐将保存到浏览器 IndexedDB，刷新后不会丢失。
                    </p>
                </div>
            )}
        </div>
    )
}

export { LocalWebPage }
