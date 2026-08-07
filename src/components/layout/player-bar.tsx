import {
    Heart,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Shuffle,
    SkipBack,
    SkipForward,
} from "lucide-react"
import type { ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { QueuePanel } from "@/components/layout/queue-panel"
import { SeekElasticSlider } from "@/components/music/seek-elastic-slider"
import { SourceBadge } from "@/components/music/source-badge"
import { VolumeElasticSlider } from "@/components/music/volume-elastic-slider"
import { Button } from "@/components/ui/button"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { resolveTrackCoverUrl } from "@/lib/music/cover-overrides"
import { cn } from "@/lib/utils"

type PlayerBarProps = {
    onOpenFullPlayer?: () => void
}

function PlayerBar({ onOpenFullPlayer }: PlayerBarProps) {
    const {
        currentTrack,
        isPlaying,
        positionMs,
        durationMs,
        volume,
        isMuted,
        shuffle,
        repeat,
        togglePlay,
        next,
        previous,
        seek,
        setVolume,
        toggleMute,
        toggleShuffle,
        cycleRepeat,
    } = usePlayer()
    const { loggedIn } = useNeteaseSession()
    const { isTrackLiked, toggleTrackLiked } = useLiked()
    const { openArtist, openAlbum } = useMusicNavigation()

    const totalMs =
        durationMs > 0 ? durationMs : (currentTrack?.durationMs ?? 0)
    const canLike =
        loggedIn && currentTrack?.source === "netease" && Boolean(currentTrack.id)
    const liked = currentTrack ? isTrackLiked(currentTrack.id) : false
    const primaryArtist = currentTrack?.artists?.find((item) => item.id)
    const canOpenArtist =
        currentTrack?.source === "netease" && Boolean(primaryArtist?.id)
    const canOpenAlbum =
        currentTrack?.source === "netease" && Boolean(currentTrack.albumId)

    async function handleToggleLike() {
        if (!canLike || !currentTrack) {
            return
        }
        try {
            await toggleTrackLiked(currentTrack.id)
        } catch {
            // use-liked 已回滚并 toast
        }
    }

    return (
        <>
        <footer className="material-player shrink-0 border-t border-black/[0.06] dark:border-white/[0.06]">
            <div className="grid h-[84px] grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 px-4">
                <div className="flex min-w-0 items-center gap-3">
                    {currentTrack ? (
                        <>
                            <button
                                type="button"
                                onClick={() => onOpenFullPlayer?.()}
                                title="全屏播放"
                                aria-label="打开全屏播放"
                                className={cn(
                                    "group shrink-0 cursor-pointer rounded-xl",
                                    "transition-transform duration-150 ease-out",
                                    "hover:scale-[1.03] active:scale-[0.97]",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                )}
                            >
                                <Cover
                                    src={resolveTrackCoverUrl(
                                        currentTrack.id,
                                        currentTrack.coverUrl,
                                    )}
                                    alt={currentTrack.title}
                                    size="md"
                                    className="shadow-[0_6px_16px_rgba(15,23,42,0.16)] ring-1 ring-black/[0.04] transition-[box-shadow] group-hover:shadow-[0_10px_24px_rgba(15,23,42,0.22)] dark:ring-white/[0.08]"
                                />
                            </button>
                            <div className="min-w-0 flex-1">
                                <button
                                    type="button"
                                    onClick={() => onOpenFullPlayer?.()}
                                    className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-left active:opacity-80"
                                    title="全屏播放"
                                >
                                    <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">
                                        {currentTrack.title}
                                    </p>
                                    <SourceBadge source={currentTrack.source} />
                                </button>
                                <p className="mt-0.5 min-w-0 truncate text-[12px] text-muted-foreground">
                                    {canOpenArtist ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openArtist(primaryArtist!.id)
                                            }
                                            className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                                            title={currentTrack.artist}
                                        >
                                            {currentTrack.artist}
                                        </button>
                                    ) : (
                                        <span>{currentTrack.artist}</span>
                                    )}
                                    {currentTrack.album ? (
                                        <>
                                            <span className="mx-1 text-muted-foreground/50">
                                                ·
                                            </span>
                                            {canOpenAlbum ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        openAlbum(
                                                            currentTrack.albumId!,
                                                        )
                                                    }
                                                    className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                                                    title={currentTrack.album}
                                                >
                                                    {currentTrack.album}
                                                </button>
                                            ) : (
                                                <span>{currentTrack.album}</span>
                                            )}
                                        </>
                                    ) : null}
                                </p>
                            </div>
                            {canLike ? (
                                <ControlButton
                                    title={liked ? "取消喜欢" : "喜欢"}
                                    active={liked}
                                    onClick={() => void handleToggleLike()}
                                >
                                    <Heart
                                        className={cn(
                                            "size-3.5",
                                            liked && "fill-current",
                                        )}
                                    />
                                </ControlButton>
                            ) : null}
                        </>
                    ) : (
                        <div className="min-w-0 pl-1">
                            <p className="text-[13px] font-medium text-foreground">未在播放</p>
                            <p className="text-[12px] text-muted-foreground">
                                从列表点选一首开始
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 flex-col items-center gap-1.5">
                    <div className="flex items-center gap-1">
                        <ControlButton
                            title="随机"
                            active={shuffle}
                            onClick={toggleShuffle}
                            disabled={!currentTrack}
                        >
                            <Shuffle className="size-3.5" />
                        </ControlButton>
                        <ControlButton
                            title="上一首"
                            onClick={previous}
                            disabled={!currentTrack}
                        >
                            <SkipBack className="size-4 fill-current" />
                        </ControlButton>
                        <Button
                            type="button"
                            size="icon"
                            className="size-9 cursor-pointer rounded-full active:scale-[0.96]"
                            onClick={togglePlay}
                            disabled={!currentTrack}
                            title={isPlaying ? "暂停" : "播放"}
                            aria-label={isPlaying ? "暂停" : "播放"}
                        >
                            {isPlaying ? (
                                <Pause className="size-4 fill-current" />
                            ) : (
                                <Play className="size-4 fill-current" />
                            )}
                        </Button>
                        <ControlButton title="下一首" onClick={next} disabled={!currentTrack}>
                            <SkipForward className="size-4 fill-current" />
                        </ControlButton>
                        <ControlButton
                            title={
                                repeat === "off"
                                    ? "循环：关"
                                    : repeat === "all"
                                      ? "循环：列表"
                                      : "循环：单曲"
                            }
                            active={repeat !== "off"}
                            onClick={cycleRepeat}
                            disabled={!currentTrack}
                        >
                            {repeat === "one" ? (
                                <Repeat1 className="size-3.5" />
                            ) : (
                                <Repeat className="size-3.5" />
                            )}
                        </ControlButton>
                    </div>

                    <div className="flex w-full max-w-[420px] items-center gap-2">
                        <SeekElasticSlider
                            positionMs={positionMs}
                            durationMs={totalMs}
                            onSeek={seek}
                            disabled={!currentTrack}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-1">
                    <QueuePanel />
                    <VolumeElasticSlider
                        volume={volume}
                        muted={isMuted}
                        onVolume={setVolume}
                        onToggleMute={toggleMute}
                        compact
                        showIcons
                    />
                </div>
            </div>
        </footer>
        </>
    )
}

function ControlButton({
    children,
    title,
    onClick,
    active = false,
    disabled = false,
}: {
    children: ReactNode
    title: string
    onClick: () => void
    active?: boolean
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors duration-100",
                "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground active:scale-[0.96]",
                "dark:hover:bg-white/[0.08]",
                "disabled:pointer-events-none disabled:opacity-40",
                active && "text-rose-600 dark:text-rose-300",
            )}
        >
            {children}
        </button>
    )
}

export { PlayerBar }