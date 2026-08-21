import {
    Heart,
    MessageCircle,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Shuffle,
    SkipBack,
    SkipForward,
} from "lucide-react"
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"

import { Cover } from "@/components/music/cover"
import { QueuePanel } from "@/components/layout/queue-panel"
import { SeekElasticSlider } from "@/components/music/seek-elastic-slider"
import { SourceBadge } from "@/components/music/source-badge"
import { SpeedPopover } from "@/components/music/speed-popover"
import { VolumeElasticSlider } from "@/components/music/volume-elastic-slider"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { resolveTrackCoverUrl } from "@/lib/music/cover-overrides"
import { usePlaybackTick } from "@/lib/player/playback-tick"
import { cn } from "@/lib/utils"

// 收合动画时长对齐 --duration-enter，避免与网格折叠动画错拍
const COLLAPSE_MS = 340
const DRAG_START_PX = 6
const COLLAPSE_FRACTION = 0.25
const FLING_VELOCITY_PX_MS = 0.6
const STRIP_REVEAL_PX = 28

type PlayerBarProps = {
    onOpenFullPlayer?: () => void
}

function PlayerBar({ onOpenFullPlayer }: PlayerBarProps) {
    const {
        currentTrack,
        isPlaying,
        volume,
        isMuted,
        shuffle,
        repeat,
        playbackRate,
        setPlaybackRate,
        togglePlay,
        next,
        previous,
        seek,
        setVolume,
        toggleMute,
        toggleShuffle,
        cycleRepeat,
    } = usePlayer()
    const { positionMs, durationMs } = usePlaybackTick()
    const { loggedIn } = useNeteaseSession()
    const { isTrackLiked, toggleTrackLiked } = useLiked()
    const { openArtist, openAlbum, openComments } = useMusicNavigation()

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

    // 迷你播放条手势：下滑隐藏，隐藏态底部细条上滑恢复
    const isMobile = useIsMobile()
    const [collapsed, setCollapsed] = useState(false)
    const [dragDy, setDragDy] = useState(0)
    const footerRef = useRef<HTMLElement | null>(null)
    const dragStartRef = useRef<{ y: number; t: number } | null>(null)
    const dragActiveRef = useRef(false)

    // 换新曲自动恢复，避免用户以为播放停了
    useEffect(() => {
        if (currentTrack) {
            setCollapsed(false)
        }
    }, [currentTrack])

    useEffect(() => {
        return () => {
            document.removeEventListener("click", swallowClick, true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function swallowClick(event: MouseEvent) {
        if (!dragActiveRef.current) {
            return
        }
        dragActiveRef.current = false
        document.removeEventListener("click", swallowClick, true)
        event.preventDefault()
        event.stopPropagation()
    }

    function beginDrag(event: ReactPointerEvent<HTMLElement>) {
        if (!isMobile || event.pointerType !== "touch") {
            return
        }
        dragStartRef.current = { y: event.clientY, t: performance.now() }
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    function handleFooterPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (!currentTrack) {
            return
        }
        const target = event.target as HTMLElement | null
        if (target?.closest("[role='slider']")) {
            return
        }
        beginDrag(event)
    }

    function handleFooterPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const dy = Math.max(0, event.clientY - start.y)
        if (!dragActiveRef.current && dy > DRAG_START_PX) {
            dragActiveRef.current = true
            document.addEventListener("click", swallowClick, true)
        }
        setDragDy(dy)
    }

    function handleFooterPointerUp(event: ReactPointerEvent<HTMLElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const dy = Math.max(0, event.clientY - start.y)
        const velocity = dy / Math.max(1, performance.now() - start.t)
        const height = footerRef.current?.offsetHeight ?? 64
        if (dy > height * COLLAPSE_FRACTION || velocity > FLING_VELOCITY_PX_MS) {
            setCollapsed(true)
            // 收起时保留下推位移，等网格折完再回位
            window.setTimeout(() => setDragDy(0), COLLAPSE_MS)
        } else {
            setDragDy(0)
        }
        if (dragActiveRef.current) {
            // click 在 pointerup 之后触发，监听器留到点击消费；无点击由超时兜底清理
            window.setTimeout(() => {
                dragActiveRef.current = false
                document.removeEventListener("click", swallowClick, true)
            }, 0)
        }
        dragStartRef.current = null
    }

    function handleFooterPointerCancel() {
        dragStartRef.current = null
        setDragDy(0)
        if (dragActiveRef.current) {
            dragActiveRef.current = false
            document.removeEventListener("click", swallowClick, true)
        }
    }

    function handleStripPointerDown(event: ReactPointerEvent<HTMLElement>) {
        beginDrag(event)
    }

    function handleStripPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const dy = event.clientY - start.y
        if (!dragActiveRef.current && dy < -DRAG_START_PX) {
            dragActiveRef.current = true
            document.addEventListener("click", swallowClick, true)
        }
        setDragDy(dy)
    }

    function handleStripPointerUp(event: ReactPointerEvent<HTMLElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const distance = -(event.clientY - start.y)
        const velocity = distance / Math.max(1, performance.now() - start.t)
        if (distance > STRIP_REVEAL_PX || velocity > FLING_VELOCITY_PX_MS) {
            setDragDy(0)
            setCollapsed(false)
        } else {
            setDragDy(0)
        }
        if (dragActiveRef.current) {
            window.setTimeout(() => {
                dragActiveRef.current = false
                document.removeEventListener("click", swallowClick, true)
            }, 0)
        }
        dragStartRef.current = null
    }

    function handleStripPointerCancel() {
        handleFooterPointerCancel()
    }

    const dragging = dragDy !== 0
    const footerTransform =
        !collapsed && dragDy > 0
            ? `translateY(${Math.min(dragDy, 200)}px)`
            : ""
    const footerTransition = dragging
        ? "none"
        : `transform ${COLLAPSE_MS}ms var(--ease-enter)`
    const stripTransform =
        collapsed && dragDy < 0
            ? `translateY(${Math.max(dragDy, -72)}px)`
            : ""
    const stripTransition = dragDy < 0
        ? "none"
        : `transform ${COLLAPSE_MS}ms var(--ease-enter)`

    return (
        <>
        <div
            className="grid shrink-0 transition-[grid-template-rows] duration-[var(--duration-enter)] ease-[var(--ease-enter)]"
            style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
        >
            <div className="min-h-0 overflow-hidden">
        <footer
            ref={footerRef}
            className="material-player border-t border-black/[0.06] dark:border-white/[0.06]"
            style={{
                // iOS 底部安全区：播放条贴在手势条上方（移动端 Tab 已含自身 safe-area）
                paddingBottom: "env(safe-area-inset-bottom)",
                transform: footerTransform,
                transition: footerTransition,
            }}
            onPointerDown={handleFooterPointerDown}
            onPointerMove={handleFooterPointerMove}
            onPointerUp={handleFooterPointerUp}
            onPointerCancel={handleFooterPointerCancel}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 md:h-[84px] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:items-center md:gap-4 md:px-4 md:py-0">
                <div className="flex min-w-0 items-center gap-3 md:col-span-1">
                    {currentTrack ? (
                        <>
                            <button
                                type="button"
                                onClick={() => onOpenFullPlayer?.()}
                                title="全屏播放"
                                aria-label="打开全屏播放"
                                className={cn(
                                    "group shrink-0 cursor-pointer rounded-xl",
                                    "transition-transform duration-[var(--duration-hover)]",
                                    "hover:scale-[1.03] active:scale-[0.97] active:duration-[var(--duration-press)]",
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
                                    <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] md:text-[13px]">
                                        {currentTrack.title}
                                    </p>
                                    <span className="shrink-0">
                                        <SourceBadge source={currentTrack.source} />
                                    </span>
                                </button>
                                <p className="mt-0.5 min-w-0 truncate text-[13px] text-muted-foreground md:text-[12px]">
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

                <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1 md:flex-col md:gap-1.5">
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

                    <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
                        <SeekElasticSlider
                            positionMs={positionMs}
                            durationMs={totalMs}
                            onSeek={seek}
                            disabled={!currentTrack}
                        />
                    </div>
                    {/* 中列是 md:flex-col items-center（子项收缩到内容宽），
                        轨道必须 w-full 撑满，flex-1 + min-w-0 会塌缩成 0 宽 */}
                    <div className="hidden w-full min-w-0 items-center gap-2 md:flex">
                        <SeekElasticSlider
                            positionMs={positionMs}
                            durationMs={totalMs}
                            onSeek={seek}
                            disabled={!currentTrack}
                        />
                    </div>
                </div>

                <div className="hidden items-center justify-end gap-1 md:flex">
                    <SpeedPopover
                        rate={playbackRate}
                        onSpeed={setPlaybackRate}
                        compact
                    />
                    {currentTrack?.source === "netease" && currentTrack.id ? (
                        <ControlButton
                            title="评论"
                            onClick={() =>
                                openComments({
                                    id: currentTrack.id,
                                    title: currentTrack.title,
                                    subtitle: currentTrack.artist,
                                })
                            }
                            disabled={!currentTrack}
                        >
                            <MessageCircle className="size-3.5" />
                        </ControlButton>
                    ) : null}
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
            </div>
        </div>
        {collapsed ? (
            <div
                role="button"
                title="显示播放条"
                aria-label="显示播放条"
                className="flex shrink-0 cursor-pointer items-center justify-center"
                style={{
                    // 隐藏态细条仍贴安全区上方，留出拇指上滑热区
                    height: "calc(1.25rem + env(safe-area-inset-bottom))",
                    paddingTop: "0.5rem",
                    transform: stripTransform,
                    transition: stripTransition,
                }}
                onClick={() => setCollapsed(false)}
                onPointerDown={handleStripPointerDown}
                onPointerMove={handleStripPointerMove}
                onPointerUp={handleStripPointerUp}
                onPointerCancel={handleStripPointerCancel}
            >
                <div className="h-1 w-12 rounded-full bg-foreground/20" />
            </div>
        ) : null}
        </>
    )
}

function ControlButton({
    children,
    title,
    onClick,
    active = false,
    disabled = false,
    className,
}: {
    children: ReactNode
    title: string
    onClick: () => void
    active?: boolean
    disabled?: boolean
    className?: string
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-full transition-[color,background-color,transform]",
                "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96] active:duration-[var(--duration-press)]",
                "disabled:pointer-events-none disabled:opacity-40",
                active && "text-rose-600 dark:text-rose-300",
                className,
            )}
        >
            {children}
        </button>
    )
}

export { PlayerBar }