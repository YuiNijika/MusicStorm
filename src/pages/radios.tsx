import { Play, Podcast, RefreshCw } from "lucide-react"
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode,
    type Ref,
} from "react"

import { Cover } from "@/components/music/cover"
import { DragList } from "@/components/music/drag-list"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { ViewModeToggle } from "@/components/music/view-mode-toggle"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import { setRadioSort, setRadioView } from "@/lib/library/layout-prefs"
import {
    ORDER_EVENT,
    getRadioOrder,
    setRadioOrder,
    type RadioOrderScope,
} from "@/lib/library/track-order"
import { RADIO_SORT_OPTIONS, sortRadios } from "@/lib/library/sort"
import { fetchDjPrograms, fetchDjSublist, fetchHomeRadios } from "@/lib/netease/dj"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Radio } from "@/lib/types"
import { cn } from "@/lib/utils"

function radioSubtitle(radio: Radio): string {
    const owner = radio.djName || radio.category
    const count =
        radio.programCount != null ? `${radio.programCount} 期` : undefined
    return [owner, count].filter(Boolean).join(" · ") || "电台"
}

function RadioList({
    items,
    scope,
    draggable,
    onOpen,
    onPlay,
}: {
    items: Radio[]
    scope: RadioOrderScope
    draggable: boolean
    onOpen: (id: string) => void
    onPlay: (radio: Radio) => void
}) {
    return (
        <DragList
            items={items}
            enabled={draggable}
            onReorder={(next) =>
                setRadioOrder(
                    scope,
                    next.map((radio) => radio.id),
                )
            }
            className="apple-list-surface space-y-0.5 p-1.5"
            renderItem={(radio, _index, handle) => (
                <div className="group flex items-center gap-1 rounded-2xl transition-colors hover:bg-[var(--surface-fill)]">
                    {handle ? <div className="ml-1 shrink-0">{handle}</div> : null}
                    <button
                        type="button"
                        onClick={() => onOpen(radio.id)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2.5 py-2 text-left active:scale-[0.995]"
                    >
                        <div className="relative shrink-0">
                            <Cover
                                src={radio.coverUrl}
                                alt={radio.title}
                                size="sm"
                                className="size-12 rounded-xl"
                            />
                            <span
                                className={cn(
                                    "pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/35 text-white opacity-0 transition-opacity",
                                    "group-hover:opacity-100 group-focus-visible:opacity-100",
                                )}
                            >
                                <Play className="size-4 fill-current" />
                            </span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium tracking-[-0.01em]">
                                {radio.title}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                {radioSubtitle(radio)}
                            </p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => onPlay(radio)}
                        title="播放"
                        className="mr-2.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--surface-fill)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-95 active:duration-[var(--duration-press)]"
                    >
                        <Play className="size-3.5 fill-current" />
                    </button>
                </div>
            )}
        />
    )
}

function RadioCollection({
    items,
    scope,
    view,
    draggable,
    gridClass,
    gridStyle,
    gridRef,
    onOpen,
    onPlay,
}: {
    items: Radio[]
    scope: RadioOrderScope
    view: "card" | "list"
    draggable: boolean
    gridClass: string
    gridStyle: CSSProperties
    gridRef?: Ref<HTMLDivElement>
    onOpen: (id: string) => void
    onPlay: (radio: Radio) => void
}) {
    if (view === "list") {
        return (
            <RadioList
                items={items}
                scope={scope}
                draggable={draggable}
                onOpen={onOpen}
                onPlay={onPlay}
            />
        )
    }

    return (
        <div ref={gridRef} className={gridClass} style={gridStyle}>
            {items.map((radio) => (
                <MediaCard
                    key={radio.id}
                    title={radio.title}
                    subtitle={radioSubtitle(radio)}
                    coverUrl={radio.coverUrl}
                    widthClassName="w-full"
                    onClick={() => onOpen(radio.id)}
                />
            ))}
        </div>
    )
}

function RadiosPage() {
    const { openRadio } = useMusicNavigation()
    const { playTrack } = usePlayer()
    const { ready, loggedIn } = useNeteaseSession()
    const { subscribedRadioIds, refresh } = useLiked()
    const { radioSort, radioView } = useLibraryLayout()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()

    const playRadio = useCallback(async (radio: Radio) => {
        try {
            const queue = await fetchDjPrograms(radio.id)
            if (queue[0]) {
                playTrack(queue[0], queue)
            }
        } catch (err) {
            notifyFromError("电台播放失败", err)
        }
    }, [playTrack])

    const [subscribed, setSubscribed] = useState<Radio[]>([])
    const [discover, setDiscover] = useState<Radio[]>([])
    const [loadingSub, setLoadingSub] = useState(false)
    const [loadingDiscover, setLoadingDiscover] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    const [orderRevision, setOrderRevision] = useState(0)

    useEffect(() => {
        const syncOrder = () => setOrderRevision((value) => value + 1)
        window.addEventListener(ORDER_EVENT, syncOrder)
        window.addEventListener("storage", syncOrder)
        return () => {
            window.removeEventListener(ORDER_EVENT, syncOrder)
            window.removeEventListener("storage", syncOrder)
        }
    }, [])

    const sortedSubscribed = useMemo(
        () =>
            sortRadios(
                subscribed,
                radioSort,
                getRadioOrder("subscribed"),
            ),
        [subscribed, radioSort, orderRevision],
    )
    const sortedDiscover = useMemo(
        () =>
            sortRadios(discover, radioSort, getRadioOrder("discover")),
        [discover, radioSort, orderRevision],
    )
    const dragEnabled = radioView === "list" && radioSort === "custom"

    const load = useCallback(async () => {
        setError(null)
        setLoadingDiscover(true)
        setLoadingSub(Boolean(loggedIn))
        try {
            const discoverList = await fetchHomeRadios(24)
            setDiscover(discoverList)
        } catch (err) {
            setDiscover([])
            setError(formatError(err))
            notifyFromError("电台加载失败", err)
        } finally {
            setLoadingDiscover(false)
        }

        if (loggedIn) {
            try {
                const list = await fetchDjSublist()
                setSubscribed(list)
                void refresh()
            } catch {
                setSubscribed([])
            } finally {
                setLoadingSub(false)
            }
        } else {
            setSubscribed([])
            setLoadingSub(false)
        }
    }, [loggedIn, refresh])

    useEffect(() => {
        if (!ready) {
            return
        }
        void load()
    }, [ready, loggedIn, retry, load])

    const controls: ReactNode = (
        <>
            <SortSelect
                value={radioSort}
                options={RADIO_SORT_OPTIONS}
                onChange={setRadioSort}
                label="电台排序"
            />
            <ViewModeToggle
                value={radioView}
                onChange={setRadioView}
                label="电台展示"
            />
            <button
                type="button"
                onClick={() => setRetry((n) => n + 1)}
                className={cn(
                    "glass-chip inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3",
                    "text-[13px] font-medium transition-transform active:scale-[0.97] active:duration-[var(--duration-press)]",
                )}
                title="刷新"
            >
                <RefreshCw className="size-3.5 opacity-70" />
                刷新
            </button>
        </>
    )

    return (
        <div className="space-y-6 pb-4">
            <PageTitle
                title="电台"
                subtitle="订阅同步 · 发现播客"
                trailing={controls}
            />

            {error && !discover.length ? (
                <StateHero
                    variant="error"
                    title="电台加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : (
                <>
                    <Section
                        title="我的订阅"
                        description={
                            loggedIn
                                ? `已同步 ${subscribed.length || subscribedRadioIds.size} 个`
                                : "登录后同步网易云订阅"
                        }
                    >
                        {!loggedIn ? (
                            <StateHero
                                variant="empty"
                                title="未登录"
                                description="登录网易云账号后可同步已订阅电台"
                                icon={Podcast}
                            />
                        ) : loadingSub ? (
                            <div className="material-panel h-28 animate-pulse rounded-[20px]" />
                        ) : subscribed.length === 0 ? (
                            <StateHero
                                variant="empty"
                                title="暂无订阅"
                                description="在电台详情页点收藏，或于网易云订阅后点刷新"
                                icon={Podcast}
                            />
                        ) : (
                            <RadioCollection
                                items={sortedSubscribed}
                                scope="subscribed"
                                view={radioView}
                                draggable={dragEnabled}
                                gridClass={gridClass}
                                gridStyle={gridStyle}
                                gridRef={gridRef}
                                onOpen={openRadio}
                                onPlay={playRadio}
                            />
                        )}
                    </Section>

                    <Section title="发现" description="推荐与热门">
                        {loadingDiscover ? (
                            <div className="material-panel h-36 animate-pulse rounded-[20px]" />
                        ) : discover.length === 0 ? (
                            <StateHero
                                variant="empty"
                                title="暂无推荐"
                                description="稍后再试或检查网络"
                            />
                        ) : (
                            <RadioCollection
                                items={sortedDiscover}
                                scope="discover"
                                view={radioView}
                                draggable={dragEnabled}
                                gridClass={gridClass}
                                gridStyle={gridStyle}
                                onOpen={openRadio}
                                onPlay={playRadio}
                            />
                        )}
                    </Section>
                </>
            )}
        </div>
    )
}

export { RadiosPage }