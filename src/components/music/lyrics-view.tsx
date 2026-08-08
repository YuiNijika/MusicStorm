import { invoke } from "@tauri-apps/api/core"
import { useEffect, useMemo, useRef, useState } from "react"

import { LyricsSkeleton } from "@/components/music/loading-skeletons"
import { usePlayer } from "@/hooks/use-player"
import {
    findActiveLyricIndex,
    parseLyricText,
    type LyricLine,
} from "@/lib/lyric/parse"
import { getLyricOverride, LYRIC_OVERRIDE_EVENT } from "@/lib/lyric/overrides"
import { fetchLyricLines } from "@/lib/netease/lyric"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type LyricsAlign = "left" | "center" | "right"

type LyricsViewProps = {
    variant?: "compact" | "full"
    /** false 时不拉接口，用于面板关闭 */
    active?: boolean
    align?: LyricsAlign
    className?: string
    listClassName?: string
}

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

// 任一步得到非空行即返回；空则继续下一条源
async function loadLocalLyricLines(track: Track): Promise<LyricLine[]> {
    if (track.lyricText?.trim()) {
        const lines = parseLyricText(track.lyricText)
        if (lines.length > 0) {
            return lines
        }
    }
    if (track.lrcPath && isTauriRuntime()) {
        try {
            const text = await invoke<string>("read_text_file", {
                path: track.lrcPath,
            })
            const lines = parseLyricText(text)
            if (lines.length > 0) {
                return lines
            }
        } catch {
        }
    }
    if (track.filePath && isTauriRuntime()) {
        for (const path of sidecarLrcCandidates(track.filePath)) {
            try {
                const text = await invoke<string>("read_text_file", { path })
                const lines = parseLyricText(text)
                if (lines.length > 0) {
                    return lines
                }
            } catch {
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
    align = "left",
    className,
    listClassName,
}: LyricsViewProps) {
    const { currentTrack, positionMs, seek } = usePlayer()
    const [lines, setLines] = useState<LyricLine[]>([])
    const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error" | "ready">(
        "idle",
    )
    const [overrideTick, setOverrideTick] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)
    const activeIndex = useMemo(
        () => findActiveLyricIndex(lines, positionMs),
        [lines, positionMs],
    )
    const isFull = variant === "full"
    const timedLyrics = lines.some((line) => line.timeMs > 0)
    const textAlignClass =
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"

    useEffect(() => {
        function onOverride() {
            setOverrideTick((n) => n + 1)
        }
        window.addEventListener(LYRIC_OVERRIDE_EVENT, onOverride)
        return () => window.removeEventListener(LYRIC_OVERRIDE_EVENT, onOverride)
    }, [])

    useEffect(() => {
        if (!active || !currentTrack) {
            return
        }

        let cancelled = false
        setStatus("loading")
        setLines([])

        const load = async () => {
            try {
                const override = getLyricOverride(currentTrack.id)
                if (override) {
                    const result = parseLyricText(override)
                    if (cancelled) {
                        return
                    }
                    setLines(result)
                    setStatus(result.length > 0 ? "ready" : "empty")
                    return
                }

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
                    const remote = await fetchLyricLines(currentTrack.id)
                    const result =
                        remote.length > 0
                            ? remote
                            : parseLyricText(currentTrack.lyricText ?? "")
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
    }, [
        active,
        currentTrack?.id,
        currentTrack?.source,
        currentTrack?.lyricText,
        currentTrack?.lrcPath,
        currentTrack?.filePath,
        overrideTick,
    ])

    useEffect(() => {
        if (!active || activeIndex < 0 || !listRef.current || !timedLyrics) {
            return
        }
        const node = listRef.current.querySelector<HTMLElement>(
            `[data-lyric-index="${activeIndex}"]`,
        )
        node?.scrollIntoView({ block: "center", behavior: "smooth" })
    }, [activeIndex, active, timedLyrics])

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
                data-sheet-scroll
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
                    <div
                        className={cn(
                            "mx-auto w-full",
                            isFull ? "max-w-2xl space-y-4" : "space-y-2",
                            textAlignClass,
                        )}
                    >
                        {lines.map((line, index) => {
                            const isActive = timedLyrics && index === activeIndex
                            return (
                                <button
                                    key={`${line.timeMs}-${index}`}
                                    type="button"
                                    data-lyric-index={index}
                                    onClick={() => {
                                        if (timedLyrics && line.timeMs > 0) {
                                            seek(line.timeMs)
                                        }
                                    }}
                                    className={cn(
                                        "block w-full transition-colors duration-150",
                                        textAlignClass,
                                        timedLyrics
                                            ? "cursor-pointer"
                                            : "cursor-default",
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