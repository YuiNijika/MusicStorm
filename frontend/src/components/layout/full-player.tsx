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
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { EqEditor } from "@/components/music/eq-editor"
import { LyricsSkeleton } from "@/components/music/loading-skeletons"
import { QueuePanel } from "@/components/layout/queue-panel"
import { SeekElasticSlider } from "@/components/music/seek-elastic-slider"
import { ShareSheet } from "@/components/music/share-sheet"
import { SourceBadge } from "@/components/music/source-badge"
import { SpeedPopover } from "@/components/music/speed-popover"
import { VolumeElasticSlider } from "@/components/music/volume-elastic-slider"
import { Button } from "@/components/ui/button"
import { bilibiliImageReferrerPolicy } from "@/lib/bilibili/image"
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
    IN_APP_SHORTCUT_EVENT,
    getInAppShortcuts,
    keydownToInAppShortcut,
} from "@/lib/app/in-app-shortcut-prefs"
import {
    CHROME_EVENT,
    resolveFullPlayerLayout,
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    LYRICS_SCALE_STEP,
    getFullPlayerChrome,
    getFullPlayerLayout,
    setFullPlayerChrome,
    setFullPlayerLayout,
    type FullPlayerChrome,
    type FullPlayerLayout,
} from "@/lib/player/full-player-prefs"
import { usePlaybackTick } from "@/lib/player/playback-tick"
import {
    createGestureSpring,
    readPointerVelocity,
    recordPointerSample,
    type PointerSample,
} from "@/lib/motion/gesture-spring"
import { isAndroid } from "@/lib/platform"
import { isShareableTrack } from "@/lib/share/share"
import type { MusicSource } from "@/lib/types"
import { cn } from "@/lib/utils"

type FullPlayerProps = {
    open: boolean
    onClose: () => void
}

// 歌词模块只在播放器展开时按需加载，避免进启动包
const LyricsView = lazy(() =>
    import("@/components/music/lyrics-view").then(m => ({ default: m.LyricsView })),
)

type Phase = "closed" | "open"

// 移动端双轴手势：超过该位移才锁定主轴，避免误判点按/滚动
const AXIS_LOCK_PX = 8
// 首尾页越界拖动的阻尼系数
const PAGE_RUBBER = 0.35
const PAGE_THRESHOLD_FRACTION = 0.33
const FLING_VELOCITY_PX_MS = 0.6
const CLOSE_FLING_VELOCITY_PX_MS = 0.8
const CLOSE_DISTANCE_FRACTION = 0.25
const SHEET_RESPONSE = 0.3
const SHEET_DAMPING = 0.8
const SCRIM_RESPONSE = 0.28
const SPRING_RESPONSE = 0.34
const FLING_SPRING_RESPONSE = 0.3
const FLING_DAMPING = 0.82
const VELOCITY_SCALE = 1000
const MOMENTUM_DECELERATION = 0.998
const PAGE_WIDTH_SCALE = 1000

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
    const [sheetReady, setSheetReady] = useState(false)
    // 关闭态冻结 tick 订阅：避免整棵全屏播放器树每 200ms 白渲一次；打开时恢复
    const { positionMs, durationMs } = usePlaybackTick(phase !== "closed")
    const [mountedTrack, setMountedTrack] = useState(currentTrack)
    const previousTrackIdRef = useRef<string | null>(null)
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
    const dragDyRef = useRef(0)
    const pageOffsetRef = useRef(0)
    const [lyricsMounted, setLyricsMounted] = useState(false)
    const samplesRef = useRef<PointerSample[]>([])
    const sheetRef = useRef<HTMLDivElement>(null)
    const pagerRef = useRef<HTMLDivElement>(null)
    const scrimRef = useRef<HTMLDivElement>(null)
    const [gestureActive, setGestureActive] = useState(false)

    const sheetSpringRef = useRef(
        createGestureSpring(
            () => dragDyRef.current,
            (next) => {
                dragDyRef.current = next
                const element = sheetRef.current
                if (!element) {
                    return
                }
                element.style.setProperty(
                    "transform",
                    `translate3d(0, ${Math.max(0, Math.min(next, window.innerHeight))}px, 0)`,
                )
                const progress = Math.max(0, Math.min(1, next / window.innerHeight))
                scrimRef.current?.style.setProperty("opacity", String(1 - progress))
            },
            () => {
                setGestureActive(false)
            },
        ),
    )
    const pageSpringRef = useRef(
        createGestureSpring(
            () => pageOffsetRef.current,
            (next) => {
                pageOffsetRef.current = next
                pagerRef.current?.style.setProperty(
                    "transform",
                    `translate3d(calc(${-pageCommittedRef.current * 100}% + ${Math.max(-window.innerWidth, Math.min(next, window.innerWidth))}px), 0, 0)`,
                )
            },
            () => {
                setGestureActive(false)
            },
        ),
    )
    const layoutSpringRef = useRef(
        createGestureSpring(
            () => {
                const value = sheetRef.current?.style.opacity
                return value ? Number(value) : 0
            },
            (value) => {
                sheetRef.current?.style.setProperty(
                    "opacity",
                    String(Math.max(0, Math.min(1, value))),
                )
            },
        ),
    )
    const openRef = useRef(open)
    openRef.current = open
    const reduceMotionRef = useRef(false)
    const pageCommittedRef = useRef(page)

    const displayTrack = mountedTrack ?? currentTrack
    useEffect(() => {
        const nextTrack = currentTrack
        if (!nextTrack || nextTrack.id === previousTrackIdRef.current) {
            return
        }
        previousTrackIdRef.current = nextTrack.id
        setLayout(() =>
            resolveFullPlayerLayout(nextTrack.source, getFullPlayerLayout()),
        )
    }, [currentTrack])
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
        inScroll: boolean
    } | null>(null)
    const axisRef = useRef<"h" | "v" | null>(null)
    // 快捷键监听闭包读 ref 里的最新值：连按放大时立即累加，不等重渲
    const chromeRef = useRef(chrome)
    chromeRef.current = chrome
    const shortcutsRef = useRef(getInAppShortcuts())

    useEffect(() => {
        requestAnimationFrame(() => setSheetReady(true))
        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        )
        reduceMotionRef.current = reduceMotion.matches
        const onReduceMotion = () => {
            reduceMotionRef.current = reduceMotion.matches
        }
        reduceMotion.addEventListener("change", onReduceMotion)
        return () => {
            sheetSpringRef.current.stop()
            pageSpringRef.current.stop()
            layoutSpringRef.current.stop()
            reduceMotion.removeEventListener("change", onReduceMotion)
        }
    }, [])

    useEffect(() => {
        function onLayout() {
            setLayout(getFullPlayerLayout())
        }
        function onChrome() {
            setChrome(getFullPlayerChrome())
        }
        function onShortcuts() {
            shortcutsRef.current = getInAppShortcuts()
        }
        window.addEventListener(LAYOUT_EVENT, onLayout)
        window.addEventListener(CHROME_EVENT, onChrome)
        window.addEventListener(IN_APP_SHORTCUT_EVENT, onShortcuts)
        return () => {
            window.removeEventListener(LAYOUT_EVENT, onLayout)
            window.removeEventListener(CHROME_EVENT, onChrome)
            window.removeEventListener(IN_APP_SHORTCUT_EVENT, onShortcuts)
        }
    }, [])

    useEffect(() => {
        if (open && currentTrack && phase === "closed" && sheetReady) {
            setMountedTrack(currentTrack)
            setPhase("open")
        }
    }, [open, currentTrack, phase, sheetReady])

    useLayoutEffect(() => {
        if (phase !== "open" || !sheetRef.current) {
            return
        }
        const closed = !openRef.current
        const reduce = reduceMotionRef.current
        if (!closed && gestureActive && !reduce) {
            sheetSpringRef.current.grab()
            layoutSpringRef.current.grab()
            sheetSpringRef.current.release({ target: 0, velocity: 0 })
            layoutSpringRef.current.release({ target: 1, velocity: 0 })
            return
        }
        sheetSpringRef.current.stop()
        pageSpringRef.current.stop()
        layoutSpringRef.current.stop()
        sheetSpringRef.current.move(window.innerHeight)
        layoutSpringRef.current.move(0)
        pageSpringRef.current.move(0)
        pageCommittedRef.current = page
        pagerRef.current?.style.setProperty(
            "transform",
            `translate3d(${-page * 100}%, 0, 0)`,
        )
        if (reduce) {
            sheetSpringRef.current.move(closed ? window.innerHeight : 0)
            layoutSpringRef.current.move(closed ? 0 : 1)
            if (closed) {
                setPhase("closed")
            }
            return
        }
        sheetSpringRef.current.release({
            target: closed ? window.innerHeight : 0,
            velocity: 0,
            response: SHEET_RESPONSE,
            damping: SHEET_DAMPING,
        })
        layoutSpringRef.current.release({
            target: closed ? 0 : 1,
            velocity: 0,
            response: SCRIM_RESPONSE,
        })
    }, [phase, open, gestureActive])

    useEffect(() => {
        if (open && currentTrack && phase === "open") {
            setMountedTrack(currentTrack)
        }
    }, [currentTrack, open, phase])

    useEffect(() => {
        if (phase === "closed") {
            return
        }
        // 打开播放器即预热歌词 chunk：切到歌词布局时不再等懒加载白屏
        void import("@/components/music/lyrics-view")
        // 关闭全屏与歌词缩放快捷键均可自定义（in-app-shortcut-prefs）
        function onKey(event: KeyboardEvent) {
            const combo = keydownToInAppShortcut(event)
            if (!combo) {
                return
            }
            const shortcuts = shortcutsRef.current
            if (combo === (shortcuts.closeFullPlayer || "Esc")) {
                event.preventDefault()
                onClose()
                return
            }
            const step =
                combo === shortcuts.lyricsScaleUp
                    ? LYRICS_SCALE_STEP
                    : combo === shortcuts.lyricsScaleDown
                        ? -LYRICS_SCALE_STEP
                        : 0
            if (step === 0) {
                return
            }
            // 写回存储后经 CHROME_EVENT 同步本地 state；
            // ref 先落值保证按住连发时逐次累加
            event.preventDefault()
            const nextScale = chromeRef.current.lyricsScale + step
            chromeRef.current = {
                ...chromeRef.current,
                lyricsScale: nextScale,
            }
            setFullPlayerChrome({ lyricsScale: nextScale })
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
    const artistLabel =
        displayTrack.source === "bilibili"
            ? displayTrack.artist?.trim() ||
            displayTrack.artists
                ?.map((artist) => artist.name.trim())
                .filter(Boolean)
                .join(" / ") ||
            "未知作者"
            : displayTrack.artist || "未知艺人"
    const secondaryMeta =
        displayTrack.source === "bilibili"
            ? displayTrack.tname?.trim()
            : displayTrack.album
    const showQuality =
        displayTrack.source === "netease" || displayTrack.source === "bilibili"
    const liked = isTrackLiked(displayTrack.id)
    const primaryArtist = displayTrack.artists?.find((item) => item.id)
    const canOpenArtist =
        displayTrack.source === "netease" && Boolean(primaryArtist?.id)
    const canOpenAlbum =
        displayTrack.source === "netease" && Boolean(displayTrack.albumId)
    const lyricsActive = phase === "open"

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
        if (!openRef.current || reduceMotionRef.current) {
            return
        }
        if (
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
            inScroll,
        }
        axisRef.current = null
        samplesRef.current = []
        recordPointerSample(
            samplesRef.current,
            event.clientX,
            event.clientY,
        )
        sheetSpringRef.current.grab()
        pageSpringRef.current.grab()
        layoutSpringRef.current.grab()
        setGestureActive(true)
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
        event.preventDefault()
        recordPointerSample(samplesRef.current, event.clientX, event.clientY)
        axisRef.current = axis
        if (axis === "h") {
            // 滚动区起手未捕获，锁轴后补捕获，防止拖出容器断流
            event.currentTarget.setPointerCapture?.(event.pointerId)
            pageSpringRef.current.move(
                dragPageOffset(dx, pageCommittedRef.current),
            )
        } else if (dy > 0) {
            sheetSpringRef.current.move(dy)
        }
    }

    function commitPage(velocity: number, projected: number) {
        const threshold = window.innerWidth * PAGE_THRESHOLD_FRACTION
        const pageWidth = Math.max(1, window.innerWidth)
        const targetPage =
            projected < -threshold || velocity < -FLING_VELOCITY_PX_MS
                ? 1
                : projected > threshold || velocity > FLING_VELOCITY_PX_MS
                    ? 0
                    : pageCommittedRef.current
        const currentPage = pageCommittedRef.current
        const target =
            targetPage === currentPage
                ? 0
                : targetPage === 1
                    ? -pageWidth
                    : pageWidth
        pageSpringRef.current.release({
            target,
            velocity: velocity * VELOCITY_SCALE,
            response:
                Math.abs(velocity) > FLING_VELOCITY_PX_MS
                    ? FLING_SPRING_RESPONSE
                    : SPRING_RESPONSE,
            damping:
                Math.abs(velocity) > FLING_VELOCITY_PX_MS
                    ? FLING_DAMPING
                    : 1,
        })
        if (targetPage !== currentPage) {
            pageCommittedRef.current = targetPage
            handleLayoutChange(targetPage === 1 ? "lyrics" : "cover")
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
        recordPointerSample(samplesRef.current, event.clientX, event.clientY)
        if (axis === "h") {
            const dx = event.clientX - start.x
            const velocity = readPointerVelocity(samplesRef.current, "x")
            const projected =
                dx +
                (velocity / PAGE_WIDTH_SCALE) * MOMENTUM_DECELERATION /
                    (1 - MOMENTUM_DECELERATION)
            commitPage(velocity, projected)
            return
        }
        const dy = Math.max(0, event.clientY - start.y)
        const velocity = readPointerVelocity(samplesRef.current, "y")
        // 跟手距离超 1/4 屏高或甩动较快 → 收起；否则回弹
        if (
            dy > window.innerHeight * CLOSE_DISTANCE_FRACTION ||
            velocity > CLOSE_FLING_VELOCITY_PX_MS
        ) {
            onClose()
            setGestureActive(true)
            sheetSpringRef.current.release({
                target: window.innerHeight,
                velocity: velocity * VELOCITY_SCALE,
                response: FLING_SPRING_RESPONSE,
                damping: FLING_DAMPING,
            })
            layoutSpringRef.current.release({
                target: 0,
                velocity: 0,
                response: 0.28,
            })
        } else {
            sheetSpringRef.current.release({
                target: 0,
                velocity: velocity * VELOCITY_SCALE,
                response: SPRING_RESPONSE,
            })
        }
    }

    function handleSheetPointerCancel() {
        dragStartRef.current = null
        axisRef.current = null
        sheetSpringRef.current.release({ target: 0, velocity: 0 })
        pageSpringRef.current.release({ target: 0, velocity: 0 })
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
            source={displayTrack.source}
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
            <h2 className="min-w-0 truncate text-[24px] font-bold tracking-[-0.03em] sm:text-[30px]">
                {displayTrack.title}
            </h2>
            <p className="truncate text-[14px] text-muted-foreground sm:text-[15px]">
                {canOpenArtist ? (
                    <button
                        type="button"
                        onClick={navigateArtist}
                        className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                    >
                        {artistLabel}
                    </button>
                ) : (
                    <span>{artistLabel}</span>
                )}
                {secondaryMeta ? (
                    <>
                        <span className="mx-1 text-muted-foreground/50">·</span>
                        {canOpenAlbum ? (
                            <button
                                type="button"
                                onClick={navigateAlbum}
                                className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                            >
                                {secondaryMeta}
                            </button>
                        ) : (
                            <span>{secondaryMeta}</span>
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
                !open && "pointer-events-none",
            )}
            role="dialog"
            aria-modal={open || undefined}
            aria-label="正在播放"
        >
            <div
                ref={sheetRef}
                className="full-player-surface relative flex h-full min-h-0 flex-col overflow-hidden"
                style={{
                    transform: "translate3d(0, 100%, 0)",
                    opacity: 0,
                    willChange: "transform, opacity",
                }}
                onPointerDown={handleSheetPointerDown}
                onPointerMove={handleSheetPointerMove}
                onPointerUp={handleSheetPointerUp}
                onPointerCancel={handleSheetPointerCancel}
            >
                <div
                    ref={scrimRef}
                    aria-hidden
                    className="full-player-backdrop pointer-events-none absolute inset-0"
                    style={{
                        opacity: 0,
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
                                    // 移动端触控目标放大到 40px
                                    "flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5",
                                    "max-md:h-10",
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
                                        "text-[12px] font-medium text-foreground/70 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
                                                "rounded-[28px] shadow-[var(--shadow-float)]",
                                                "ring-1 ring-white/20 dark:ring-white/10",
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
                                            scale={chrome.lyricsScale}
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
                                    ref={pagerRef}
                                    className="flex h-full min-h-0"
                                    style={{
                                        transform: `translate3d(calc(${-page * 100}% + 0px), 0, 0)`,
                                        willChange: "transform",
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
                                                    scale={chrome.lyricsScale}
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
                                                    scale={chrome.lyricsScale}
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
                        className="relative z-[1] shrink-0 border-t border-foreground/10 px-4 py-3 sm:px-8"
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
    source,
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
    source: MusicSource
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
                ) : source === "local" || source === "bilibili" ? (
                    // 本地曲目无喜欢：来源徽章补到这个空位，保持布局平衡
                    <span className="flex size-10 items-center">
                        <SourceBadge source={source} />
                    </span>
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
                    <>
                        {/* 移动端队列管理入口：放在「更多」左侧 */}
                        <QueuePanel />
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
                    </>
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
    // 背板自带大半径模糊，Android WebView 用缩略图即可保持观感，
    // 解码位图与合成纹理都小一个量级
    const kind = isAndroid() ? "thumbnail" : "original"
    const resolved = useCachedCoverUrl(src, kind)
    if (!resolved) {
        return null
    }
    return (
        <img
            src={resolved}
            alt=""
            referrerPolicy={bilibiliImageReferrerPolicy(src)}
            loading="lazy"
            decoding="async"
            className="full-player-backdrop-image"
        />
    )
}

export { FullPlayer }
