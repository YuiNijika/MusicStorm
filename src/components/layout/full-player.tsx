import {
    AudioLines,
    ChevronDown,
    Heart,
    LayoutTemplate,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Shuffle,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
} from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { SeekElasticSlider } from "@/components/music/seek-elastic-slider"
import { SourceBadge } from "@/components/music/source-badge"
import { VolumeElasticSlider } from "@/components/music/volume-elastic-slider"
import { Button } from "@/components/ui/button"
import { useCachedCoverUrl } from "@/hooks/use-cached-cover-url"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { useWindowControls } from "@/hooks/use-window-controls"
import {
    QUALITY_OPTIONS,
    getNeteaseQualityBr,
    labelForQualityBr,
    setNeteaseQualityBr,
    type QualityBr,
} from "@/lib/netease/quality"
import { resolveTrackCoverUrl } from "@/lib/music/cover-overrides"
import {
    getInAppShortcuts,
    keydownToInAppShortcut,
} from "@/lib/app/in-app-shortcut-prefs"
import {
    CHROME_EVENT,
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    getFullPlayerChrome,
    getFullPlayerLayout,
    setFullPlayerLayout,
    type FullPlayerChrome,
    type FullPlayerLayout,
} from "@/lib/player/full-player-prefs"
import { cn } from "@/lib/utils"

type FullPlayerProps = {
    open: boolean
    onClose: () => void
}

// 歌词模块只在播放器展开时按需加载，避免进启动包
const LyricsView = lazy(() =>
    import("@/components/music/lyrics-view").then(m => ({ default: m.LyricsView })),
)

type Phase = "closed" | "entering" | "open" | "exiting"

// 时长与 App.css 的 motion token 对齐（--duration-enter/exit、reduced-motion cross-fade 150ms）
const DRAWER_MS = 340
const REDUCED_FADE_MS = 150

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") {
        return false
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function FullPlayer({ open, onClose }: FullPlayerProps) {
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
        reloadCurrent,
    } = usePlayer()
    const { startDragging } = useWindowControls()
    const { loggedIn } = useNeteaseSession()
    const { isTrackLiked, toggleTrackLiked } = useLiked()
    const { openArtist, openAlbum } = useMusicNavigation()

    const [qualityBr, setQualityBr] = useState<QualityBr>(() => getNeteaseQualityBr())
    const [layout, setLayout] = useState<FullPlayerLayout>(() => getFullPlayerLayout())
    const [chrome, setChrome] = useState<FullPlayerChrome>(() => getFullPlayerChrome())
    const [phase, setPhase] = useState<Phase>("closed")
    const [mountedTrack, setMountedTrack] = useState(currentTrack)
    // 移动端下滑收起手势：跟手位移（px）+ 起始 Y（区分水平滚动）
    const [dragDy, setDragDy] = useState(0)
    const dragStartRef = useRef<{ y: number; startDy: number } | null>(null)
    // 进出场计时器不能挂在 phase 依赖的 effect 上：phase→exiting 会触发 cleanup 清掉 closed 定时器
    const enterTimerRef = useRef<number | null>(null)
    const exitTimerRef = useRef<number | null>(null)
    const phaseRef = useRef<Phase>(phase)
    phaseRef.current = phase

    function clearEnterTimer() {
        if (enterTimerRef.current != null) {
            window.clearTimeout(enterTimerRef.current)
            enterTimerRef.current = null
        }
    }

    function clearExitTimer() {
        if (exitTimerRef.current != null) {
            window.clearTimeout(exitTimerRef.current)
            exitTimerRef.current = null
        }
    }

    useEffect(() => {
        function onLayout() {
            setLayout(getFullPlayerLayout())
        }
        function onChrome() {
            setChrome(getFullPlayerChrome())
        }
        window.addEventListener(LAYOUT_EVENT, onLayout)
        window.addEventListener(CHROME_EVENT, onChrome)
        return () => {
            window.removeEventListener(LAYOUT_EVENT, onLayout)
            window.removeEventListener(CHROME_EVENT, onChrome)
            clearEnterTimer()
            clearExitTimer()
        }
    }, [])

    useEffect(() => {
        if (open && currentTrack) {
            setMountedTrack(currentTrack)
            clearExitTimer()
            const current = phaseRef.current
            if (current === "closed" || current === "exiting") {
                setPhase("entering")
                clearEnterTimer()
                const reduce = prefersReducedMotion()
                enterTimerRef.current = window.setTimeout(
                    () => {
                        enterTimerRef.current = null
                        setPhase("open")
                    },
                    // 留两帧让初始态渲染完成，transition 才有起点
                    reduce ? 0 : 32,
                )
            }
            return
        }

        if (!open) {
            clearEnterTimer()
            const current = phaseRef.current
            if (current === "open" || current === "entering") {
                setPhase("exiting")
                clearExitTimer()
                const reduce = prefersReducedMotion()
                exitTimerRef.current = window.setTimeout(
                    () => {
                        exitTimerRef.current = null
                        setPhase("closed")
                    },
                    reduce ? REDUCED_FADE_MS : DRAWER_MS,
                )
            }
        }
    }, [open, currentTrack])

    useEffect(() => {
        if (open && currentTrack && phase !== "closed" && phase !== "exiting") {
            setMountedTrack(currentTrack)
        }
    }, [currentTrack, open, phase])

    useEffect(() => {
        if (phase === "closed" || phase === "exiting") {
            return
        }
        // 关闭全屏快捷键可自定义（in-app-shortcut-prefs）
        const closeCombo =
            getInAppShortcuts().closeFullPlayer || "Esc"
        function onKey(event: KeyboardEvent) {
            const combo = keydownToInAppShortcut(event)
            if (combo && combo === closeCombo) {
                event.preventDefault()
                onClose()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [phase, onClose])

    const displayTrack = mountedTrack ?? currentTrack
    if (phase === "closed" || !displayTrack) {
        return null
    }

    const displayCover = resolveTrackCoverUrl(
        displayTrack.id,
        displayTrack.coverUrl,
    )
    const totalMs = durationMs > 0 ? durationMs : displayTrack.durationMs
    const showQuality = displayTrack.source === "netease"
    const canLike =
        loggedIn && displayTrack.source === "netease" && Boolean(displayTrack.id)
    const liked = isTrackLiked(displayTrack.id)
    const primaryArtist = displayTrack.artists?.find((item) => item.id)
    const canOpenArtist =
        displayTrack.source === "netease" && Boolean(primaryArtist?.id)
    const canOpenAlbum =
        displayTrack.source === "netease" && Boolean(displayTrack.albumId)
    const lyricsActive = phase === "open" || phase === "entering"
    // 从底部升起/滑回（锚定底栏触发源，空间一致），全程无 blur（避免卡顿）
    // 位移统一用 transform 内联：Tailwind v4 的 translate-y-* 走 CSS translate 属性，
    // 与手势 transform 属性不一致会导致动画跳变闪烁。这里全部走 transform + transition。
    const baseTransform =
        phase === "exiting"
            ? "translateY(100%)"
            : phase === "open"
              ? "translateY(0)"
              : "translateY(100%)"
    const sheetTransform =
        dragDy > 0
            ? `translateY(${Math.min(dragDy, window.innerHeight)}px)`
            : baseTransform
    const sheetTransition =
        dragDy > 0
            ? "none"
            : `transform ${DRAWER_MS}ms var(--ease-enter), opacity ${DRAWER_MS}ms var(--ease-enter)`
    const scrimMotion =
        phase === "exiting"
            ? "full-player-scrim-exit"
            : phase === "open"
              ? "opacity-100"
              : "opacity-0"

    function navigateArtist() {
        if (!primaryArtist?.id) {
            return
        }
        openArtist(primaryArtist.id)
        onClose()
    }

    function handleSheetPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        if (
            phase !== "open" ||
            event.pointerType !== "touch" ||
            window.innerWidth >= 768
        ) {
            return
        }
        // 歌词/列表等滚动容器内按下 → 交给浏览器垂直滚动，不触发收起手势
        const target = event.target as HTMLElement | null
        if (target?.closest("[data-sheet-scroll], .apple-scroll, button")) {
            return
        }
        dragStartRef.current = { y: event.clientY, startDy: dragDy }
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    }

    function handleSheetPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const dy = Math.max(0, event.clientY - start.y + start.startDy)
        setDragDy(dy)
    }

    function handleSheetPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        dragStartRef.current = null
        const dy = Math.max(0, event.clientY - start.y + start.startDy)
        setDragDy(0)
        // 跟手距离超过 1/4 屏高或松手速度较快 → 收起；否则回弹
        const threshold = window.innerHeight * 0.25
        if (dy > threshold) {
            onClose()
        }
    }
    function navigateAlbum() {
        if (!displayTrack?.albumId) {
            return
        }
        openAlbum(displayTrack.albumId)
        onClose()
    }

    function handleQualityChange(next: QualityBr) {
        setNeteaseQualityBr(next)
        setQualityBr(next)
        reloadCurrent()
    }

    function handleLayoutChange(next: FullPlayerLayout) {
        setFullPlayerLayout(next)
        setLayout(next)
    }

    async function handleToggleLike() {
        if (!canLike || !displayTrack) {
            return
        }
        try {
            await toggleTrackLiked(displayTrack.id)
        } catch {
            // store 已回滚
        }
    }

    const transport = (
        <TransportBar
            isPlaying={isPlaying}
            shuffle={shuffle}
            repeat={repeat}
            showQuality={showQuality}
            canLike={canLike}
            liked={liked}
            qualityBr={qualityBr}
            isMuted={isMuted}
            volume={volume}
            onTogglePlay={togglePlay}
            onPrevious={previous}
            onNext={next}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeat}
            onToggleMute={toggleMute}
            onVolume={(v) => setVolume(v)}
            onQuality={handleQualityChange}
            onToggleLike={() => void handleToggleLike()}
        />
    )

    const progressRow = (
        <SeekElasticSlider
            positionMs={positionMs}
            durationMs={totalMs}
            onSeek={seek}
        />
    )

    const meta = (
        <div className="space-y-1.5 text-center">
            <div className="flex items-center justify-center gap-2">
                <h2 className="truncate text-[22px] font-semibold tracking-[-0.04em] sm:text-[26px]">
                    {displayTrack.title}
                </h2>
                <SourceBadge source={displayTrack.source} />
            </div>
            <p className="truncate text-[14px] text-muted-foreground sm:text-[15px]">
                {canOpenArtist ? (
                    <button
                        type="button"
                        onClick={navigateArtist}
                        className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                    >
                        {displayTrack.artist}
                    </button>
                ) : (
                    <span>{displayTrack.artist}</span>
                )}
                {displayTrack.album ? (
                    <>
                        <span className="mx-1 text-muted-foreground/50">·</span>
                        {canOpenAlbum ? (
                            <button
                                type="button"
                                onClick={navigateAlbum}
                                className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                            >
                                {displayTrack.album}
                            </button>
                        ) : (
                            <span>{displayTrack.album}</span>
                        )}
                    </>
                ) : null}
            </p>
        </div>
    )

    return (
        <div
            className={cn(
                "fixed inset-0 z-[80] flex flex-col",
                // 退场时仍占满屏：必须关掉命中，否则卡住或动画期会挡住底层
                phase === "exiting" && "pointer-events-none",
            )}
            role="dialog"
            aria-modal={phase === "exiting" ? undefined : true}
            aria-label="正在播放"
        >
            <div
                className={cn(
                    "full-player-surface relative flex h-full min-h-0 flex-col overflow-hidden",
                    phase === "open" || phase === "entering"
                        ? "opacity-100"
                        : "opacity-0",
                )}
                style={{
                    transform: sheetTransform,
                    transition: sheetTransition,
                }}
                onPointerDown={handleSheetPointerDown}
                onPointerMove={handleSheetPointerMove}
                onPointerUp={handleSheetPointerUp}
                onPointerCancel={handleSheetPointerUp}
            >
                <div
                    aria-hidden
                    className={cn(
                        "full-player-backdrop pointer-events-none absolute inset-0",
                        scrimMotion,
                    )}
                    style={{
                        transitionProperty: "opacity",
                        transitionDuration: `${DRAWER_MS}ms`,
                        transitionTimingFunction: "var(--ease-enter)",
                    }}
                >
                    {displayCover ? (
                        <CachedBackdropImage src={displayCover} />
                    ) : null}
                    <div className="full-player-backdrop-tint" />
                </div>

                <div className="relative z-[1] flex h-full min-h-0 flex-col">
                    <div
                        className="flex h-12 shrink-0 items-center justify-between gap-2 px-4"
                        onPointerDown={(event) => {
                            if ((event.target as HTMLElement).closest("button")) return
                            if (event.pointerType !== "mouse") return
                            startDragging(event)
                        }}
                    >
                    <button
                        type="button"
                        onClick={onClose}
                        onPointerDown={(event) => event.stopPropagation()}
                        className={cn(
                            "flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5",
                            "text-[13px] font-medium text-foreground/70",
                            "transition-colors duration-100 hover:bg-black/[0.06] hover:text-foreground",
                            "active:scale-[0.97] dark:hover:bg-white/[0.1]",
                        )}
                    >
                        <ChevronDown className="size-4" />
                        收起
                    </button>

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            onPointerDown={(event) => event.stopPropagation()}
                            className={cn(
                                "flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5",
                                "text-[12px] font-medium text-foreground/70 outline-none",
                                "transition-colors duration-100 hover:bg-black/[0.06] hover:text-foreground",
                                "active:scale-[0.97] dark:hover:bg-white/[0.1]",
                            )}
                            title="播放样式"
                        >
                            <LayoutTemplate className="size-3.5" />
                            {FULL_PLAYER_LAYOUTS.find((item) => item.id === layout)?.label ??
                                "样式"}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-[160px]">
                            {FULL_PLAYER_LAYOUTS.map((item) => (
                                <DropdownMenuItem
                                    key={item.id}
                                    className="cursor-pointer flex-col items-start gap-0.5"
                                    onClick={() => handleLayoutChange(item.id)}
                                >
                                    <span className="text-[13px] font-medium">
                                        {item.label}
                                        {layout === item.id ? " · 当前" : ""}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                        {item.description}
                                    </span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="w-[72px]" aria-hidden />
                </div>

                {layout === "classic" ? (
                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-6 pb-3 pt-2 lg:grid-cols-2 lg:gap-10 lg:px-12">
                        <div className="flex min-h-0 flex-col items-center justify-center gap-6">
                            <div className="w-full max-w-[min(400px,78vw)]">
                                <Cover
                                    src={displayCover}
                                    alt={displayTrack.title}
                                    size="xl"
                                    className={cn(
                                        "rounded-[28px] shadow-[0_24px_64px_rgba(15,23,42,0.28)]",
                                        "ring-1 ring-white/20 dark:shadow-[0_24px_64px_rgba(0,0,0,0.55)] dark:ring-white/10",
                                        isPlaying &&
                                            "animate-[cover-breathe_6s_ease-in-out_infinite]",
                                    )}
                                />
                            </div>
                            <div className="w-full max-w-[min(400px,78vw)] space-y-3">
                                {meta}
                            </div>
                        </div>
                        {lyricsActive ? (
                            <Suspense fallback={null}>
                                <LyricsView
                                    variant="full"
                                    active={lyricsActive}
                                    className="min-h-0 flex-1"
                                    listClassName="h-full"
                                />
                            </Suspense>
                        ) : null}
                    </div>
                ) : null}

                {layout === "cover" ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-3">
                        <div className="w-full max-w-[min(440px,82vw)]">
                            <Cover
                                src={displayCover}
                                alt={displayTrack.title}
                                size="xl"
                                className={cn(
                                    "rounded-[32px] shadow-[0_28px_72px_rgba(15,23,42,0.3)]",
                                    "ring-1 ring-white/20 dark:ring-white/10",
                                    isPlaying &&
                                        "animate-[cover-breathe_6s_ease-in-out_infinite]",
                                )}
                            />
                        </div>
                        <div className="w-full max-w-[min(440px,82vw)] space-y-2">{meta}</div>
                    </div>
                ) : null}

                {layout === "lyrics" ? (
                    <div className="flex min-h-0 flex-1 flex-col px-4 pb-2 pt-1 sm:px-8">
                        {lyricsActive ? (
                            <Suspense fallback={null}>
                                <LyricsView
                                    variant="full"
                                    active={lyricsActive}
                                    align={chrome.lyricsAlign}
                                    className="h-full min-h-0 flex-1"
                                    listClassName="h-full py-2"
                                />
                            </Suspense>
                        ) : null}
                    </div>
                ) : null}

                <div
                    className="relative z-[1] shrink-0 border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.08] sm:px-8"
                    style={{
                        // iOS 底部安全区：控制条贴在手势条上方
                        paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
                    }}
                >
                    <div className="mx-auto flex w-full max-w-[min(92vw,1100px)] flex-col gap-2.5">
                        {progressRow}
                        {transport}
                    </div>
                </div>
            </div>
        </div>
    </div>
    )
}

function TransportBar({
    isPlaying,
    shuffle,
    repeat,
    showQuality,
    canLike,
    liked,
    qualityBr,
    isMuted,
    volume,
    onTogglePlay,
    onPrevious,
    onNext,
    onToggleShuffle,
    onCycleRepeat,
    onToggleMute,
    onVolume,
    onQuality,
    onToggleLike,
}: {
    isPlaying: boolean
    shuffle: boolean
    repeat: "off" | "all" | "one"
    showQuality: boolean
    canLike: boolean
    liked: boolean
    qualityBr: QualityBr
    isMuted: boolean
    volume: number
    onTogglePlay: () => void
    onPrevious: () => void
    onNext: () => void
    onToggleShuffle: () => void
    onCycleRepeat: () => void
    onToggleMute: () => void
    onVolume: (v: number) => void
    onQuality: (br: QualityBr) => void
    onToggleLike: () => void
}) {
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex items-center justify-start">
                {canLike ? (
                    <IconBtn
                        title={liked ? "取消喜欢" : "喜欢"}
                        active={liked}
                        onClick={onToggleLike}
                    >
                        <Heart
                            className={cn("size-4", liked && "fill-current")}
                        />
                    </IconBtn>
                ) : (
                    <span className="size-10" aria-hidden />
                )}
            </div>

            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                <IconBtn title="随机" active={shuffle} onClick={onToggleShuffle}>
                    <Shuffle className="size-4" />
                </IconBtn>
                <IconBtn title="上一首" onClick={onPrevious}>
                    <SkipBack className="size-5 fill-current" />
                </IconBtn>
                <Button
                    type="button"
                    size="icon"
                    className="size-12 cursor-pointer rounded-full active:scale-[0.96] sm:size-14"
                    onClick={onTogglePlay}
                    title={isPlaying ? "暂停" : "播放"}
                    aria-label={isPlaying ? "暂停" : "播放"}
                >
                    {isPlaying ? (
                        <Pause className="size-5 fill-current sm:size-6" />
                    ) : (
                        <Play className="size-5 fill-current sm:size-6" />
                    )}
                </Button>
                <IconBtn title="下一首" onClick={onNext}>
                    <SkipForward className="size-5 fill-current" />
                </IconBtn>
                <IconBtn
                    title={
                        repeat === "off"
                            ? "循环：关"
                            : repeat === "all"
                              ? "循环：列表"
                              : "循环：单曲"
                    }
                    active={repeat !== "off"}
                    onClick={onCycleRepeat}
                >
                    {repeat === "one" ? (
                        <Repeat1 className="size-4" />
                    ) : (
                        <Repeat className="size-4" />
                    )}
                </IconBtn>
            </div>

            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                <Popover>
                    <PopoverTrigger
                        className={cn(
                            "flex size-10 cursor-pointer items-center justify-center rounded-full",
                            "text-muted-foreground transition-colors duration-100",
                            "hover:bg-black/[0.05] hover:text-foreground active:scale-[0.96]",
                            "dark:hover:bg-white/[0.08]",
                        )}
                        title="音量"
                        aria-label="音量"
                    >
                        {isMuted || volume === 0 ? (
                            <VolumeX className="size-4" />
                        ) : (
                            <Volume2 className="size-4" />
                        )}
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-56 gap-2 p-3">
                        <VolumeElasticSlider
                            volume={volume}
                            muted={isMuted}
                            onVolume={onVolume}
                            onToggleMute={onToggleMute}
                            showValue
                            showIcons
                            fluid
                        />
                    </PopoverContent>
                </Popover>

                {showQuality ? (
                    <Popover>
                        <PopoverTrigger
                            className={cn(
                                "flex size-10 cursor-pointer items-center justify-center rounded-full",
                                "text-muted-foreground transition-colors duration-100",
                                "hover:bg-black/[0.05] hover:text-foreground active:scale-[0.96]",
                                "dark:hover:bg-white/[0.08]",
                            )}
                            title={`音质 · ${labelForQualityBr(qualityBr)}`}
                            aria-label={`音质 · ${labelForQualityBr(qualityBr)}`}
                        >
                            <AudioLines className="size-4" />
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-44 gap-1 p-1.5">
                            {QUALITY_OPTIONS.map((option) => (
                                <button
                                    key={option.br}
                                    type="button"
                                    onClick={() => onQuality(option.br)}
                                    className={cn(
                                        "w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-[12px] font-medium",
                                        qualityBr === option.br
                                            ? "bg-foreground text-background"
                                            : "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]",
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </PopoverContent>
                    </Popover>
                ) : null}
            </div>
        </div>
    )
}

function IconBtn({
    children,
    title,
    onClick,
    active = false,
}: {
    children: ReactNode
    title: string
    onClick: () => void
    active?: boolean
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={cn(
                "flex size-10 cursor-pointer items-center justify-center rounded-full",
                "text-muted-foreground transition-colors duration-100",
                "hover:bg-black/[0.05] hover:text-foreground active:scale-[0.96]",
                "dark:hover:bg-white/[0.08]",
                active && "text-rose-600 dark:text-rose-300",
            )}
        >
            {children}
        </button>
    )
}

// 远程 URL 透明升级为本地缓存，避免每次打开都拉 CDN
function CachedBackdropImage({ src }: { src: string }) {
    const resolved = useCachedCoverUrl(src, "original")
    return <img src={resolved} alt="" className="full-player-backdrop-image" />
}

export { FullPlayer }