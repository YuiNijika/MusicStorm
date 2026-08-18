import { Library, ListMusic, Pause, Play, Trash2, X } from "lucide-react"
import { useState } from "react"

import { Cover } from "@/components/music/cover"
import { AddToPlaylistDialog } from "@/components/music/add-to-playlist-dialog"
import { DragList } from "@/components/music/drag-list"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { usePlayer } from "@/hooks/use-player"
import { resolveTrackCoverUrl } from "@/lib/music/cover-overrides"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

function QueuePanel() {
    const {
        queue,
        currentIndex,
        isPlaying,
        jumpTo,
        removeFromQueue,
        clearQueue,
        reorderQueue,
    } = usePlayer()

    const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(
        null,
    )

    const count = queue.length

    function handleReorder(next: Track[]) {
        const prev = queue
        if (prev.length !== next.length || prev.length < 2) {
            return
        }
        // DragList 回传的是移动后的完整数组；reorderQueue 需要 from/to 索引。
        // 通过「移除某项后其余顺序一致」反推移动项及其新旧位置（队列内 id 唯一）。
        for (let i = 0; i < prev.length; i += 1) {
            const moved = prev[i]
            const to = next.findIndex((item) => item.id === moved.id)
            if (to < 0) {
                continue
            }
            const prevRest = prev.filter((_, k) => k !== i).map((t) => t.id)
            const nextRest = next.filter((_, k) => k !== to).map((t) => t.id)
            if (prevRest.every((id, k) => id === nextRest[k])) {
                reorderQueue(i, to)
                return
            }
        }
    }

    return (
        <>
        <Popover>
            <PopoverTrigger
                title="播放队列"
                aria-label="播放队列"
                className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full transition-[color,background-color,transform]",
                    "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96] active:duration-[var(--duration-press)]",
                    "disabled:pointer-events-none disabled:opacity-40",
                )}
            >
                <ListMusic className="size-4" />
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="top"
                sideOffset={12}
                className="w-[340px] overflow-hidden p-0"
            >
                <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-[13px] font-semibold tracking-[-0.01em]">
                            接下来播放
                        </h3>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                            {count} 首
                        </span>
                    </div>
                    {count > 0 ? (
                        <button
                            type="button"
                            onClick={clearQueue}
                            className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] hover:text-destructive"
                        >
                            <Trash2 className="size-3" />
                            清空
                        </button>
                    ) : null}
                </div>

                {count === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-fill)]">
                            <ListMusic className="size-4 text-muted-foreground" />
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                            队列为空，右键歌曲选择「加入队列」
                        </p>
                    </div>
                ) : (
                    <div className="max-h-[min(52vh,420px)] overflow-y-auto p-2">
                        <DragList
                            items={queue}
                            enabled={count > 1}
                            onReorder={handleReorder}
                            renderItem={(track, index, handle) => {
                                const active = index === currentIndex
                                return (
                                    <div
                                        className={cn(
                                            "group flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5",
                                            active
                                                ? "bg-[var(--surface-fill-hover)]"
                                                : "hover:bg-[var(--surface-fill)]",
                                        )}
                                    >
                                        {count > 1 ? (
                                            <span
                                                className="shrink-0 cursor-grab text-muted-foreground/40 active:cursor-grabbing"
                                                title="拖动排序"
                                            >
                                                {handle}
                                            </span>
                                        ) : (
                                            <span className="w-[18px] shrink-0" />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => jumpTo(index)}
                                            className="relative shrink-0"
                                            title={active ? "当前播放" : "播放这首"}
                                        >
                                            <Cover
                                                src={resolveTrackCoverUrl(
                                                    track.id,
                                                    track.coverUrl,
                                                    "thumbnail",
                                                )}
                                                alt={track.title}
                                                size="xs"
                                            />
                                            <span
                                                className={cn(
                                                    "pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/35 text-white",
                                                    active && isPlaying
                                                        ? "opacity-100"
                                                        : "opacity-0 group-hover:opacity-100",
                                                )}
                                            >
                                                {active && isPlaying ? (
                                                    <Pause className="size-3 fill-current" />
                                                ) : (
                                                    <Play className="size-3 fill-current" />
                                                )}
                                            </span>
                                        </button>
                                        <div className="min-w-0 flex-1 text-left">
                                            <p
                                                className={cn(
                                                    "truncate text-[12px] font-medium",
                                                    active
                                                        ? "text-primary"
                                                        : "text-foreground",
                                                )}
                                            >
                                                {track.title}
                                            </p>
                                            <p className="truncate text-[11px] text-muted-foreground">
                                                {track.artist}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-0.5">
                                            {track.source === "netease" ? (
                                                <button
                                                    type="button"
                                                    title="添加到歌单"
                                                    aria-label={`将 ${track.title} 添加到歌单`}
                                                    onClick={() =>
                                                        setAddToPlaylistTrack(
                                                            track,
                                                        )
                                                    }
                                                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/50 opacity-0 transition-[opacity,color,background-color] hover:bg-[var(--surface-fill)] hover:text-foreground group-hover:opacity-100"
                                                >
                                                    <Library className="size-3.5" />
                                                </button>
                                            ) : null}
                                            {active ? (
                                                <span className="text-[11px] font-medium text-muted-foreground">
                                                    播放中
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeFromQueue(index)
                                                    }
                                                    title="从队列移除"
                                                    aria-label={`移除 ${track.title}`}
                                                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/50 opacity-0 transition-[opacity,color,background-color] hover:bg-[var(--surface-fill)] hover:text-destructive group-hover:opacity-100"
                                                >
                                                    <X className="size-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            }}
                        />
                    </div>
                )}
            </PopoverContent>
        </Popover>

        <AddToPlaylistDialog
            track={addToPlaylistTrack}
            open={addToPlaylistTrack !== null}
            onOpenChange={(open) => {
                if (!open) {
                    setAddToPlaylistTrack(null)
                }
            }}
        />
        </>
    )
}

export { QueuePanel }
