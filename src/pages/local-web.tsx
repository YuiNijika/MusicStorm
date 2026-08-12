import { useCallback, useEffect, useMemo, useState } from "react"

import { TrackRow } from "@/components/music/track-row"
import { usePlayer } from "@/hooks/use-player"
import { notifyWarning } from "@/lib/notify"
import { formatDuration } from "@/lib/format"
import {
    authorizeWebTrack,
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
 * 网页版本地音乐页
 *
 * 浏览器无文件系统权限：Chromium 走 FSA 引用本地目录，其余浏览器存副本
 * 到 IndexedDB；刷新后自动恢复列表，授权降级的条目点播时重新授权
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
    const { currentTrack, isPlaying, playOrToggle } = usePlayer()

    // 刷新后音乐不丢：挂载即从持久化库恢复上次导入
    useEffect(() => {
        let cancelled = false
        void loadWebLibrary()
            .then((list) => {
                if (!cancelled) {
                    setTracks(list)
                }
            })
            .catch(() => {
                // 隐私模式等场景持久化不可用：降级为空列表，本次会话内存导入
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

    useEffect(() => {
        let cancelled = false
        void estimateWebStorage().then((info) => {
            if (cancelled || !info) {
                return
            }
            setStorageLabel(` · 已占用 ${formatBytes(info.usage)}`)
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

    // 点播：未授权条目先请求目录授权再播放；同曲再点切换播放/暂停
    const handlePlay = useCallback(
        async (track: WebLocalTrack, queue: WebLocalTrack[]) => {
            if (track.needsAuth) {
                try {
                    const authorized = await authorizeWebTrack(track)
                    setTracks((prev) =>
                        prev.map((item) =>
                            item.id === track.id ? authorized : item,
                        ),
                    )
                    playOrToggle(authorized, queue)
                } catch {
                    notifyWarning("需要授权访问文件夹", {
                        description: "点击播放时浏览器会弹出授权，允许后可继续",
                        id: `web-auth-${track.id}`,
                    })
                }
                return
            }
            playOrToggle(track, queue)
        },
        [playOrToggle],
    )

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
                        音乐保存在浏览器中，刷新页面后不会丢失；
                        下载桌面端可体验完整本地曲库管理。
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void importDirectory()}
                        disabled={importing || restoring}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                    >
                        {importing ? "解析中…" : "选择文件夹"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void importFiles()}
                        disabled={importing || restoring}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-foreground transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                    >
                        选择音频文件
                    </button>
                </div>
            </div>

            {restoring ? (
                <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center dark:border-white/[0.16]">
                    <p className="text-[14px] text-muted-foreground">
                        正在恢复上次导入的音乐…
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
                            className="shrink-0 rounded-full px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] hover:text-foreground"
                        >
                            清空存储
                        </button>
                    </div>
                    <div className="apple-list-surface space-y-0.5 p-1.5">
                        {tracks.map((track) => (
                            <TrackRow
                                key={track.id}
                                track={track}
                                isActive={currentTrack?.id === track.id}
                                isPlaying={
                                    currentTrack?.id === track.id && isPlaying
                                }
                                showSource={false}
                                showAlbumMeta={false}
                                dense
                                onPlay={(item) =>
                                    void handlePlay(item as WebLocalTrack, tracks)
                                }
                                trailing={
                                    track.needsAuth ? (
                                        <span className="text-[12px] text-muted-foreground">
                                            需授权
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-label={`移除 ${track.title}`}
                                            onClick={() => removeTrack(track)}
                                            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] hover:text-foreground"
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
                                    )
                                }
                            />
                        ))}
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
                        音乐将保存在浏览器中，刷新后不会丢失。
                    </p>
                </div>
            )}
        </div>
    )
}

export { LocalWebPage }
