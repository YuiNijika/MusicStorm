import { invoke } from "@tauri-apps/api/core"
import { useEffect, useMemo, useRef, useState } from "react"

import { LyricsSkeleton } from "@/components/music/loading-skeletons"
import { usePlayer } from "@/hooks/use-player"
import { findActiveLyricIndex, parseLrc, type LyricLine } from "@/lib/lyric/parse"
import { fetchLyricLines } from "@/lib/netease/lyric"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type LyricsViewProps = {
    /** compact：底栏条；full：全屏右栏 */
    variant?: "compact" | "full"
    /** 为 false 时不拉接口（面板关闭） */
    active?: boolean
    className?: string
    listClassName?: string
}

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function loadLocalLyricLines(track: Track): Promise<LyricLine[]> {
    // 1) 扫描时写入的短文本
    if (track.lyricText?.trim()) {
        return parseLrc(track.lyricText)
    }
    // 2) sidecar / 缓存 lrc 路径
    if (track.lrcPath && isTauriRuntime()) {
        try {
            const text = await invoke<string>("read_text_file", { path: track.lrcPath })
            const lines = parseLrc(text)
            if (lines.length > 0) {
                return lines
            }
        } catch {
            // fall through
        }
    }
    // 3) 同目录同名 .lrc（未入库时兜底）
    if (track.filePath && isTauriRuntime()) {
        const candidates = sidecarLrcCandidates(track.filePath)
        for (const path of candidates) {
            try {
                const text = await invoke<string>("read_text_file", { path })
                const lines = parseLrc(text)
                if (lines.length > 0) {
                    return lines
                }
            } catch {
                // try next
            }
        }
    }
    return []
}

function sidecarLrcCandidates(filePath: string): string[] {
    const match = /^(.*[\\/])?([^\\/]+?)(\.[^.\\/]+)?$/.exec(filePath)
    if (!match) {
        return []
    }
    const dir = match[1] ?? ""
    const stem = match[2] ?? ""
    return [
        `${dir}${stem}.lrc`,
        `${dir}${stem}.LRC`,
        `${dir}${stem}.zh.lrc`,
        `${dir}${stem}.lrc.zh`,
        `${dir}${stem}.chs.lrc`,
        `${dir}${stem}.cht.lrc`,
    ]
}

function LyricsView({
    variant = "compact",
    active = true,
    className,
    listClassName,
}: LyricsViewProps) {
    const { currentTrack, positionMs, seek } = usePlayer()
    const [lines, setLines] = useState<LyricLine[]>([])
    const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error" | "ready">(
        "idle",
    )
    const listRef = useRef<HTMLDivElement>(null)
    const activeIndex = useMemo(
        () => findActiveLyricIndex(lines, positionMs),
        [lines, positionMs],
    )
    const isFull = variant === "full"

    useEffect(() => {
        if (!active || !currentTrack) {
            return
        }

        let cancelled = false
        setStatus("loading")
        setLines([])

        const load = async () => {
            try {
                if (currentTrack.source === "local") {
                    const result = await loadLocalLyricLines(currentTrack)
                    if (cancelled) {
                        return
                    }
                    setLines(result)
                    setStatus(result.length > 0 ? "ready" : "empty")
                    return
                }

                if (currentTrack.source === "netease" && /^\d+$/.test(currentTrack.id)) {
                    const result = await fetchLyricLines(currentTrack.id)
                    if (cancelled) {
                        return
                    }
                    setLines(result)
                    setStatus(result.length > 0 ? "ready" : "empty")
                    return
                }

                if (!cancelled) {
                    setLines([])
                    setStatus("empty")
                }
            } catch {
                if (!cancelled) {
                    setLines([])
                    setStatus("error")
                }
            }
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [active, currentTrack?.id, currentTrack?.source, currentTrack?.lyricText, currentTrack?.lrcPath, currentTrack?.filePath])

    useEffect(() => {
        if (!active || activeIndex < 0 || !listRef.current) {
            return
        }
        const node = listRef.current.querySelector<HTMLElement>(
            `[data-lyric-index="${activeIndex}"]`,
        )
        node?.scrollIntoView({ block: "center", behavior: "smooth" })
    }, [activeIndex, active])

    const showSkeleton = Boolean(currentTrack) && status === "loading"
    const message = !currentTrack
        ? "播放歌曲后显示歌词"
        : status === "error"
          ? "歌词获取失败"
          : status === "empty" || (status === "ready" && lines.length === 0)
            ? "暂无歌词"
            : null

    return (
        <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
            <div
                ref={listRef}
                className={cn(
                    "apple-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain",
                    isFull ? "px-4 py-6 sm:px-8" : "px-6 py-4",
                    (message || showSkeleton) && "flex items-center justify-center",
                    listClassName,
                )}
            >
                {showSkeleton ? (
                    <LyricsSkeleton />
                ) : message ? (
                    <p className="text-center text-[13px] text-muted-foreground">{message}</p>
                ) : (
                    <div className={cn("mx-auto w-full", isFull ? "max-w-lg space-y-4" : "space-y-2")}>
                        {lines.map((line, index) => {
                            const isActive = index === activeIndex
                            return (
                                <button
                                    key={`${line.timeMs}-${index}`}
                                    type="button"
                                    data-lyric-index={index}
                                    onClick={() => seek(line.timeMs)}
                                    className={cn(
                                        "block w-full cursor-pointer text-left transition-colors duration-150",
                                        isFull
                                            ? "rounded-xl px-3 py-1.5 text-[18px] leading-snug tracking-[-0.01em]"
                                            : "rounded-lg px-2 py-1 text-[13px] leading-snug",
                                        isActive
                                            ? "font-semibold text-foreground"
                                            : "font-normal text-muted-foreground hover:text-foreground/80",
                                    )}
                                >
                                    {line.text}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export { LyricsView }