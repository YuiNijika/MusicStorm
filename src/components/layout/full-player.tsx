import {
    AudioLines,
    ChevronDown,
    Heart,
    LayoutTemplate,
    MessageCircle,
    MoreHorizontal,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Share2,
    Shuffle,
    SkipBack,
    SkipForward,
    SlidersHorizontal,
    Volume2,
    VolumeX,
} from "lucide-react"
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { EqEditor } from "@/components/music/eq-editor"
import { LyricsSkeleton } from "@/components/music/loading-skeletons"
import { SeekElasticSlider } from "@/components/music/seek-elastic-slider"
import { ShareSheet } from "@/components/music/share-sheet"
import { SourceBadge } from "@/components/music/source-badge"
import { SpeedPopover } from "@/components/music/speed-popover"
import { VolumeElasticSlider } from "@/components/music/volume-elastic-slider"
import { Button } from "@/components/ui/button"
import { useCachedCoverUrl } from "@/hooks/use-cached-cover-url"
import { useIsMobile } from "@/hooks/use-mobile"
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
import { fetchSongStats } from "@/lib/netease/comment"
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
import { usePlaybackTick } from "@/lib/player/playback-tick"
import { isShareableTrack } from "@/lib/share/share"
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
// 移动端双轴手势：超过该位移才锁定主轴，避免误判点按/滚动
const AXIS_LOCK_PX = 8
// 首尾页越界拖动的阻尼系数
const PAGE_RUBBER = 0.35
const PAGE_THRESHOLD_FRACTION = 0.33
const FLING_VELOCITY_PX_MS = 0.6
const CLOSE_FLING_VELOCITY_PX_MS = 0.8

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
        cyclePlayMode,
        reloadCurrent,
    } = usePlayer()
    const { startDragging } = useWindowControls()
    const { loggedIn } = useNeteaseSession()
    const { isTrackLiked, toggleTrackLiked } = useLiked()
    const { openArtist, openAlbum, openComments } = useMusicNavigation()
    const isMobile = useIsMobile()

    const [qualityBr, setQualityBr] = useState<QualityBr>(() => getNeteaseQualityBr())
    const [layout, setLayout] = useState<FullPlayerLayout>(() => getFullPlayerLayout())
    const [chrome, setChrome] = useState<FullPlayerChrome>(() => getFullPlayerChrome())
    // 分享弹层（路由模式）：把当前曲目打包成可直达播放的链接分享到各平台
    const [shareOpen, setShareOpen] = useState(false)
    // 动画结束后移除标记，下一次切换才能重新播放淡入
    const [layoutFade, setLayoutFade] = useState(false)
    const [phase, setPhase] = useState<Phase>("closed")
    // 关闭态冻结 tick 订阅：避免整棵全屏播放器树每 200ms 白渲一次；打开时恢复
    const { positionMs, durationMs } = usePlaybackTick(phase !== "closed")
    const [mountedTrack, setMountedTrack] = useState(currentTrack)
    const [likeCount, setLikeCount] = useState<number | null>(null)
    // 移动端只保留 封面/歌词 两种布局；classic 是桌面分栏，窄屏降级到封面
    const availableLayouts = isMobile
        ? FULL_PLAYER_LAYOUTS.filter((item) => item.id !== "classic")
        : FULL_PLAYER_LAYOUTS
    const effectiveLayout: FullPlayerLayout =
        isMobile && layout === "classic" ? "cover" : layout
    // 歌词页首次滑到才挂载，保持按需加载；滑回不卸载避免重复拉取
    useEffect(() => {
        if (effectiveLayout === "lyrics") {
            setLyricsMounted(true)
        }
    }, [effectiveLayout])
    // 移动端翻页器当前页：0 = 封面，1 = 歌词
    const page = effectiveLayout === "lyrics" ? 1 : 0
    // 移动端手势：纵向下滑收起，横向在封面/歌词两页间翻页
    const [dragDy, setDragDy] = useState(0)
    const [pageOffset, setPageOffset] = useState(0)
    const [lyricsMounted, setLyricsMounted] = useState(false)

    const displayTrack = mountedTrack ?? currentTrack
    const canLike = Boolean(
        loggedIn && displayTrack?.source === "netease" && displayTrack?.id,
    )

    const handleToggleLike = useCallback(async () => {
        if (!canLike || !displayTrack) {
            return
        }
        try {
            await toggleTrackLiked(displayTrack.id)
        } catch {
            // store 已回滚
        }
    }, [canLike, displayTrack, toggleTrackLiked])

    const handleQualityChange = useCallback(
        (next: QualityBr) => {
            setNeteaseQualityBr(next)
            setQualityBr(next)
            reloadCurrent()
        },
        [reloadCurrent],
    )

    const handleOpenComments = useCallback(() => {
        if (!displayTrack) {
            return
        }
        openComments({
            id: displayTrack.id,
            title: displayTrack.title,
            subtitle: displayTrack.artist,
        })
        onClose()
    }, [displayTrack, onClose, openComments])
    const dragStartRef = useRef<{
        x: number
        y: number
        t: number
        inScroll: boolean
    } | null>(null)
    const axisRef = useRef<"h" | "v" | null>(null)
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
        // 打开播放器即预热歌词 chunk：切到歌词布局时不再等懒加载白屏
        void import("@/components/music/lyrics-view")
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

    // 红心量/播放量：仅网易云曲目，游客态返回 0 时隐藏
    useEffect(() => {
        if (!currentTrack || currentTrack.source !== "netease" || !currentTrack.id) {
            setLikeCount(null)
            return
        }
        let cancelled = false
        setLikeCount(null)
        void fetchSongStats(currentTrack.id)
            .then((stats) => {
                if (!cancelled) {
                    setLikeCount(stats.likedCount)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLikeCount(null)
                }
            })
        return () => {
            cancelled = true
        }
    }, [currentTrack?.id, currentTrack?.source])

    if (phase === "closed" || !displayTrack) {
        return null
    }

    const displayCover = resolveTrackCoverUrl(
        displayTrack.id,
        displayTrack.coverUrl,
    )
    const totalMs = durationMs > 0 ? durationMs : displayTrack.durationMs
    const showQuality = displayTrack.source === "netease"
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

    function resolveAxis(
        dx: number,
        dy: number,
        inScroll: boolean,
    ): "h" | "v" | null {
        if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
            return "h"
        }
        // 滚动区纵向交给浏览器原生滚动，不接管为收起
        if (!inScroll && dy > AXIS_LOCK_PX && dy > Math.abs(dx)) {
            return "v"
        }
        return null
    }

    function handleSheetPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        if (
            phase !== "open" ||
            event.pointerType !== "touch" ||
            window.innerWidth >= 768
        ) {
            return
        }
        // 歌词等滚动区不捕获，垂直交给原生滚动；控件区不抢点按
        const target = event.target as HTMLElement | null
        const inScroll = Boolean(
            target?.closest("[data-sheet-scroll], .apple-scroll"),
        )
        if (!inScroll && target?.closest("button, [role='slider']")) {
            return
        }
        dragStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            t: performance.now(),
            inScroll,
        }
        axisRef.current = null
        if (!inScroll) {
            event.currentTarget.setPointerCapture?.(event.pointerId)
        }
    }

    function dragPageOffset(dx: number, currentPage: number): number {
        // 首页右滑、尾页左滑超屏宽做阻尼，松手才回位
        if (
            (currentPage === 0 && dx > 0) ||
            (currentPage === 1 && dx < 0)
        ) {
            return dx * PAGE_RUBBER
        }
        return dx
    }

    function handleSheetPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        const axis = axisRef.current ?? resolveAxis(dx, dy, start.inScroll)
        if (!axis) {
            return
        }
        axisRef.current = axis
        if (axis === "h") {
            // 滚动区起手未捕获，锁轴后补捕获，防止拖出容器断流
            event.currentTarget.setPointerCapture?.(event.pointerId)
            setPageOffset(dragPageOffset(dx, page))
        } else if (dy > 0) {
            setDragDy(dy)
        }
    }

    function commitPage(dx: number, elapsed: number) {
        const velocity = Math.abs(dx) / Math.max(1, elapsed)
        const threshold = window.innerWidth * PAGE_THRESHOLD_FRACTION
        let next = page
        if (dx < 0 && (Math.abs(dx) > threshold || velocity > FLING_VELOCITY_PX_MS)) {
            next = 1
        } else if (dx > 0 && (dx > threshold || velocity > FLING_VELOCITY_PX_MS)) {
            next = 0
        }
        setPageOffset(0)
        if (next !== page) {
            handleLayoutChange(next === 1 ? "lyrics" : "cover")
        }
    }

    function handleSheetPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
        const start = dragStartRef.current
        if (!start) {
            return
        }
        const axis = axisRef.current
        dragStartRef.current = null
        axisRef.current = null
        const elapsed = performance.now() - start.t
        if (axis === "h") {
            commitPage(event.clientX - start.x, elapsed)
            return
        }
        setDragDy(0)
        const dy = Math.max(0, event.clientY - start.y)
        const velocity = dy / Math.max(1, elapsed)
        // 跟手距离超 1/4 屏高或甩动较快 → 收起；否则回弹
        if (dy > window.innerHeight * 0.25 || velocity > CLOSE_FLING_VELOCITY_PX_MS) {
            onClose()
        }
    }

    function handleSheetPointerCancel() {
        dragStartRef.current = null
        axisRef.current = null
        setDragDy(0)
        setPageOffset(0)
    }
    function navigateAlbum() {
        if (!displayTrack?.albumId) {
            return
        }
        openAlbum(displayTrack.albumId)
        onClose()
    }

    function handleLayoutChange(next: FullPlayerLayout) {
        // 移动端翻页器自带滑动过渡，桌面菜单切换才需要淡入避免内容跳变
        if (next !== effectiveLayout && !isMobile) {
            setLayoutFade(true)
        }
        setFullPlayerLayout(next)
        setLayout(next)
    }

    const transport = (
        <TransportBar
            isPlaying={isPlaying}
            shuffle={shuffle}
            repeat={repeat}
            playbackRate={playbackRate}
            onSpeed={setPlaybackRate}
            showQuality={showQuality}
            canLike={canLike}
            liked={liked}
            qualityBr={qualityBr}
            isMuted={isMuted}
            volume={volume}
            onTogglePlay={togglePlay}
            onPrevious={previous}
            onNext={next}
            onCyclePlayMode={cyclePlayMode}
            onToggleMute={toggleMute}
            onVolume={setVolume}
            onQuality={handleQualityChange}
            onToggleLike={handleToggleLike}
            likeCount={likeCount}
            onOpenComments={handleOpenComments}
            trackId={displayTrack.id}
            onShare={() => setShareOpen(true)}
            canShowShare={isShareableTrack(displayTrack)}
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
            <div className="flex min-w-0 items-center justify-center gap-2">
                <h2 className="min-w-0 truncate text-[24px] font-bold tracking-[-0.03em] sm:text-[30px]">
                    {displayTrack.title}
                </h2>
                <span className="flex shrink-0 items-center">
                    <SourceBadge source={displayTrack.source} />
                </span>
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
                onPointerCancel={handleSheetPointerCancel}
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
                        className="flex min-h-12 shrink-0 items-center justify-between gap-2 px-4"
                        style={{
                            // 顶部安全区
                            paddingTop: "env(safe-area-inset-top)",
                        }}
                        onPointerDown={(event) => {
                            // 只让空白区参与拖拽/双击：按钮、Base UI 弹层部件
                            // （data-slot）一律不穿透，避免菜单项点击误触最大化还原
                            if (
                                (event.target as HTMLElement).closest(
                                    "button, [data-slot], [role='menuitem'], [role='menu']",
                                )
                            )
                                return
                            if (event.pointerType !== "mouse") return
                            // 双击动作与主标题栏一致（最大化/还原）；
                            // 拖动由系统原生 HTCAPTION 拖拽接管
                            startDragging(event)
                        }}
                    >
                    <div className="flex flex-1 justify-start">
                        <button
                            type="button"
                            onClick={onClose}
                            onPointerDown={(event) => event.stopPropagation()}
                            className={cn(
                                "flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5",
                                "text-[13px] font-medium text-foreground/70",
                                "transition-[color,background-color,transform] hover:bg-[var(--surface-fill)] hover:text-foreground",
                                "active:scale-[0.97] active:duration-[var(--duration-press)]",
                            )}
                        >
                            <ChevronDown className="size-4" />
                            收起
                        </button>
                    </div>

                    <div className="flex flex-1 justify-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                onPointerDown={(event) => event.stopPropagation()}
                                className={cn(
                                    "flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5",
                                    "text-[12px] font-medium text-foreground/70 outline-none",
                                    "transition-[color,background-color,transform] hover:bg-[var(--surface-fill)] hover:text-foreground",
                                    "active:scale-[0.97] active:duration-[var(--duration-press)]",
                                )}
                                title="播放样式"
                            >
                                <LayoutTemplate className="size-3.5" />
                                {availableLayouts.find((item) => item.id === effectiveLayout)
                                    ?.label ?? "样式"}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-60 p-3">
                                <div className="space-y-0.5">
                                    {availableLayouts.map((item) => (
                                        <DropdownMenuItem
                                            key={item.id}
                                            className="cursor-pointer flex-col items-start gap-0.5"
                                            onClick={() => handleLayoutChange(item.id)}
                                        >
                                            <span className="text-[13px] font-medium">
                                                {item.label}
                                                {effectiveLayout === item.id ? " · 当前" : ""}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground">
                                                {item.description}
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex flex-1 justify-end" aria-hidden />
                </div>

                <div
                    className={cn(
                        "flex min-h-0 flex-1 flex-col",
                        !isMobile && layoutFade && "full-player-layout-in",
                    )}
                    onAnimationEnd={(event) => {
                        // 封面呼吸等子元素动画结束后会向上冒泡，只有布局淡入自身结束才允许复位
                        if (
                            event.target === event.currentTarget &&
                            event.animationName === "full-player-layout-in"
                        ) {
                            setLayoutFade(false)
                        }
                    }}
                >
                {effectiveLayout === "classic" ? (
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
                            <Suspense fallback={<LyricsSkeleton />}>
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

                {isMobile ? (
                    <div className="relative min-h-0 flex-1 overflow-hidden">
                        <div
                            className="flex h-full min-h-0"
                            style={{
                                transform: `translateX(calc(${-page * 100}% + ${pageOffset}px))`,
                                transition:
                                    pageOffset !== 0
                                        ? "none"
                                        : `transform ${DRAWER_MS}ms var(--ease-enter)`,
                            }}
                        >
                            <div className="flex w-full min-h-0 shrink-0 flex-col items-center overflow-hidden px-6 pb-4">
                                <div className="my-auto flex min-h-0 w-full max-w-[min(440px,82vw)] flex-col items-center gap-5">
                                    <div className="w-full">
                                        <button
                                            type="button"
                                            aria-label="切换为歌词"
                                            onClick={() =>
                                                handleLayoutChange("lyrics")
                                            }
                                            className="block w-full cursor-pointer"
                                        >
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
                                        </button>
                                    </div>
                                    <div className="w-full space-y-2">
                                        {meta}
                                    </div>
                                </div>
                            </div>
                            <div className="flex w-full min-h-0 shrink-0 flex-col overflow-hidden px-4 pb-2 pt-1 sm:px-8">
                                {lyricsMounted ? (
                                    <Suspense fallback={<LyricsSkeleton />}>
                                        <LyricsView
                                            variant="full"
                                            active={lyricsActive && page === 1}
                                            align={chrome.lyricsAlign}
                                            className="h-full min-h-0 flex-1"
                                            listClassName="h-full py-2"
                                        />
                                    </Suspense>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {effectiveLayout === "cover" ? (
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

                        {effectiveLayout === "lyrics" ? (
                            <div className="flex min-h-0 flex-1 flex-col px-4 pb-2 pt-1 sm:px-8">
                                {lyricsActive ? (
                                    <Suspense fallback={<LyricsSkeleton />}>
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
                    </>
                )}
                </div>

                <div
                    className="relative z-[1] shrink-0 border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.08] sm:px-8"
                    style={{
                        // iOS 底部安全区：控制条贴在手势条上方
                        paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
                    }}
                >
                    <div className="flex w-full flex-col gap-2.5">
                        {progressRow}
                        {transport}
                    </div>
                </div>
            </div>

            <ShareSheet
                open={shareOpen}
                onOpenChange={setShareOpen}
                track={displayTrack}
            />
        </div>
    </div>
    )
}

// memo：除 canLike/liked/likeCount/trackId 等低频值外全部为稳定回调，
// 全屏播放器 200ms tick 重渲时跳过整条控制栏（含音量/EQ/音质弹层）
const TransportBar = memo(function TransportBar({
    isPlaying,
    shuffle,
    repeat,
    playbackRate,
    onSpeed,
    showQuality,
    canLike,
    liked,
    qualityBr,
    isMuted,
    volume,
    onTogglePlay,
    onPrevious,
    onNext,
    onCyclePlayMode,
    onToggleMute,
    onVolume,
    onQuality,
    onToggleLike,
    likeCount,
    onOpenComments,
    trackId,
    onShare,
    canShowShare,
}: {
    isPlaying: boolean
    shuffle: boolean
    repeat: "off" | "all" | "one"
    playbackRate: number
    onSpeed: (rate: number) => void
    showQuality: boolean
    canLike: boolean
    liked: boolean
    qualityBr: QualityBr
    isMuted: boolean
    volume: number
    onTogglePlay: () => void
    onPrevious: () => void
    onNext: () => void
    onCyclePlayMode: () => void
    onToggleMute: () => void
    onVolume: (v: number) => void
    onQuality: (br: QualityBr) => void
    onToggleLike: () => void
    likeCount: number | null
    onOpenComments: () => void
    trackId: string | null
    /** 分享（路由模式）：打包可直达播放链接导出到各平台 */
    onShare: () => void
    canShowShare: boolean
}) {
    const isMobile = useIsMobile()
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex items-center justify-start">
                {canLike ? (
                    <>
                        <IconBtn
                            title={liked ? "取消喜欢" : "喜欢"}
                            active={liked}
                            onClick={onToggleLike}
                        >
                            <Heart
                                className={cn("size-4", liked && "fill-current")}
                            />
                        </IconBtn>
                        {likeCount != null && likeCount > 0 ? (
                            <span className="ml-0.5 text-[11px] tabular-nums text-muted-foreground">
                                {likeCount >= 10_000
                                    ? `${(likeCount / 10_000).toFixed(1)}万`
                                    : likeCount}
                            </span>
                        ) : null}
                    </>
                ) : (
                    <span className="size-10" aria-hidden />
                )}
            </div>

            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                {!isMobile ? (
                    <SpeedPopover rate={playbackRate} onSpeed={onSpeed} />
                ) : null}
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
                        shuffle
                            ? "随机播放"
                            : repeat === "one"
                              ? "循环：单曲"
                              : repeat === "all"
                                ? "循环：列表"
                                : "顺序播放"
                    }
                    active={shuffle || repeat !== "off"}
                    onClick={onCyclePlayMode}
                >
                    {shuffle ? (
                        <Shuffle className="size-4" />
                    ) : repeat === "one" ? (
                        <Repeat1 className="size-4" />
                    ) : (
                        <Repeat className="size-4" />
                    )}
                </IconBtn>
            </div>

            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                {isMobile ? (
                    <Popover>
                        <PopoverTrigger
                            className={cn(
                                "flex size-10 cursor-pointer items-center justify-center rounded-full",
                                "text-muted-foreground transition-[color,background-color,transform]",
                                "hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96]",
                                "active:duration-[var(--duration-press)]",
                            )}
                            title="更多"
                            aria-label="更多"
                        >
                            <MoreHorizontal className="size-5" />
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            align="end"
                            className="w-[min(88vw,340px)] max-h-[70dvh] gap-3 overflow-y-auto p-3.5"
                        >
                            <div className="space-y-4">
                                <VolumeElasticSlider
                                    volume={volume}
                                    muted={isMuted}
                                    onVolume={onVolume}
                                    onToggleMute={onToggleMute}
                                    showValue
                                    showIcons
                                    fluid
                                />
                                {showQuality ? (
                                    <div>
                                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                                            音质
                                        </p>
                                        <div className="flex flex-col gap-1">
                                            {QUALITY_OPTIONS.map((option) => (
                                                <button
                                                    key={option.br}
                                                    type="button"
                                                    onClick={() => onQuality(option.br)}
                                                    className={cn(
                                                        "w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-[12px] font-medium",
                                                        qualityBr === option.br
                                                            ? "bg-foreground text-background"
                                                            : "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground",
                                                    )}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                <div>
                                    <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                                        播放速度
                                    </p>
                                    <div className="flex justify-start">
                                        <SpeedPopover rate={playbackRate} onSpeed={onSpeed} />
                                    </div>
                                </div>
                                <EqEditor compact trackId={trackId} />
                                {showQuality ? (
                                    <button
                                        type="button"
                                        onClick={onOpenComments}
                                        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground"
                                    >
                                        <MessageCircle className="size-4" />
                                        评论
                                    </button>
                                ) : null}
                                {canShowShare ? (
                                    <button
                                        type="button"
                                        onClick={onShare}
                                        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground"
                                    >
                                        <Share2 className="size-4" />
                                        分享
                                    </button>
                                ) : null}
                            </div>
                        </PopoverContent>
                    </Popover>
                ) : (
                    <>
                <Popover>
                    <PopoverTrigger
                        className={cn(
                            "flex size-10 cursor-pointer items-center justify-center rounded-full",
                            "text-muted-foreground transition-[color,background-color,transform]",
                            "hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96]",
                            "active:duration-[var(--duration-press)]",
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

                <Popover>
                    <PopoverTrigger
                        className={cn(
                            "flex size-10 cursor-pointer items-center justify-center rounded-full",
                            "text-muted-foreground transition-[color,background-color,transform]",
                            "hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96]",
                            "active:duration-[var(--duration-press)]",
                        )}
                        title="均衡器"
                        aria-label="均衡器"
                    >
                        <SlidersHorizontal className="size-4" />
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-[min(92vw,380px)] p-3.5">
                        <EqEditor compact trackId={trackId} />
                    </PopoverContent>
                </Popover>

                {showQuality ? (
                    <Popover>
                        <PopoverTrigger
                            className={cn(
                                "flex size-10 cursor-pointer items-center justify-center rounded-full",
                                "text-muted-foreground transition-[color,background-color,transform]",
                                "hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96]",
                                "active:duration-[var(--duration-press)]",
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
                                            : "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground",
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </PopoverContent>
                    </Popover>
                ) : null}

                {canShowShare ? (
                    <IconBtn title="分享" onClick={onShare}>
                        <Share2 className="size-4" />
                    </IconBtn>
                ) : null}

                {showQuality ? (
                    <IconBtn title="评论" onClick={onOpenComments}>
                        <MessageCircle className="size-4" />
                    </IconBtn>
                ) : null}
                    </>
                )}
            </div>
        </div>
    )
})

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
                "text-muted-foreground transition-[color,background-color,transform]",
                "hover:bg-[var(--surface-fill)] hover:text-foreground active:scale-[0.96]",
                "active:duration-[var(--duration-press)]",
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
    return (
        <img
            src={resolved}
            alt=""
            loading="lazy"
            decoding="async"
            className="full-player-backdrop-image"
        />
    )
}

export { FullPlayer }