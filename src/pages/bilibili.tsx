import { Play, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Cover } from "@/components/music/cover"
import { AccountAvatar } from "@/components/bilibili/account-avatar"
import { CardsRail } from "@/components/music/media-rail"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { usePlayer } from "@/hooks/use-player"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import {
    fetchBilibiliFeaturedPlaylists,
    fetchBilibiliFeaturedUps,
    fetchBilibiliMusicRanking,
    type BilibiliFeaturedPlaylist,
    type BilibiliFeaturedUp,
    type BilibiliMusicShelf,
} from "@/lib/bilibili/search"
import type { AppRoute } from "@/lib/routes"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type TrackPlayerProps = {
    currentTrackId?: string
    playOrToggle: (track: Track, queue: Track[]) => void
}

type BilibiliPageProps = {
    onNavigate: (route: AppRoute) => void
}

function BilibiliHomeSkeleton() {
    return (
        <div
            role="status"
            aria-label="正在加载音乐…"
            className="space-y-8"
        >
            <div className="material-surface flex flex-row overflow-hidden rounded-[22px]">
                <div className="aspect-square w-28 shrink-0 animate-pulse bg-[var(--surface-fill)] sm:w-[168px] md:w-[200px]" />
                <div className="flex flex-1 flex-col justify-center gap-2 p-4 sm:p-6">
                    <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-fill)]" />
                    <div className="h-6 w-3/5 animate-pulse rounded bg-[var(--surface-fill)]" />
                    <div className="h-4 w-2/5 animate-pulse rounded bg-[var(--surface-fill)]" />
                </div>
            </div>
            {Array.from({ length: 2 }, (_, section) => (
                <section key={section} className="space-y-3">
                    <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface-fill)]" />
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {Array.from({ length: 2 }, (_, column) => (
                            <div
                                key={column}
                                className="apple-list-surface space-y-1 p-2"
                            >
                                {Array.from({ length: 8 }, (_, row) => (
                                    <div
                                        key={row}
                                        className="flex h-11 items-center gap-2.5 rounded-xl px-1"
                                    >
                                        <div className="size-9 shrink-0 animate-pulse rounded-lg bg-[var(--surface-fill)]" />
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--surface-fill)]" />
                                            <div className="h-2.5 w-2/5 animate-pulse rounded bg-[var(--surface-fill)]" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}

function FeaturedTrack({
    track,
    queue,
    currentTrackId,
    isPlaying,
    playOrToggle,
}: {
    track: Track
    queue: Track[]
    isPlaying: boolean
} & TrackPlayerProps) {
    const active = currentTrackId === track.id

    return (
        <button
            type="button"
            onClick={() => playOrToggle(track, queue)}
            className={cn(
                "group relative flex w-full cursor-pointer flex-row overflow-hidden rounded-[22px] text-left",
                "material-surface",
                "transition-[background-color,box-shadow,transform] duration-[var(--duration-hover)] active:duration-[var(--duration-press)]",
                "hover:shadow-[0_12px_40px_rgba(15,23,42,0.1)]",
                "active:scale-[0.99]",
                "dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
            )}
        >
            <div className="relative aspect-square w-28 shrink-0 sm:w-[168px] md:w-[200px]">
                <Cover
                    src={track.coverUrl}
                    alt={track.title}
                    size="xl"
                    eager
                    className="size-full rounded-none transition-transform duration-[var(--duration-enter)] ease-[var(--ease-enter)] group-hover:scale-[1.03]"
                />
                <span
                    aria-hidden="true"
                    className="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-float)]"
                >
                    <Play className="size-4 fill-current" />
                </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-4 sm:gap-2 sm:p-6">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-primary uppercase sm:text-[12px]">
                    {track.tname || "热门音乐"}
                </p>
                <p className="line-clamp-2 text-[22px] font-bold tracking-[-0.04em] text-foreground sm:text-[26px] md:text-[30px]">
                    {track.title}
                </p>
                <p className="line-clamp-1 text-[13px] text-muted-foreground sm:text-[14px]">
                    {track.artist}
                </p>
                <p className="mt-1 text-[12px] font-medium text-primary">
                    {active && isPlaying ? "正在播放" : "播放"}
                </p>
            </div>
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/[0.03] dark:to-white/[0.04]"
            />
        </button>
    )
}

function splitIntoColumns<T>(items: T[], columns: number): T[][] {
    if (items.length === 0) {
        return Array.from({ length: columns }, () => [])
    }
    const size = Math.ceil(items.length / columns)
    return Array.from({ length: columns }, (_, index) =>
        items.slice(index * size, index * size + size),
    )
}

function TrackColumns({
    tracks,
    currentTrackId,
    isPlaying,
    playOrToggle,
}: {
    tracks: Track[]
    currentTrackId?: string
    isPlaying: boolean
    playOrToggle: (track: Track, queue: Track[]) => void
}) {
    const columns = splitIntoColumns(tracks, 2)
    return (
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            {columns.map((column, columnIndex) => (
                <div
                    key={columnIndex}
                    className="apple-list-surface min-w-0 p-1"
                >
                    {column.map((track, index) => {
                        const globalIndex =
                            columns
                                .slice(0, columnIndex)
                                .reduce((sum, item) => sum + item.length, 0) + index
                        return (
                            <TrackRow
                                key={track.id}
                                track={track}
                                index={globalIndex}
                                isActive={currentTrackId === track.id}
                                isPlaying={currentTrackId === track.id && isPlaying}
                                showSource={false}
                                showAlbumColumn={false}
                                showAlbumMeta={false}
                                showActions={false}
                                dense
                                onPlay={(item) => playOrToggle(item, tracks)}
                            />
                        )
                    })}
                </div>
            ))}
        </div>
    )
}

function FeaturedUps({
    items,
    onOpenUp,
}: {
    items: BilibiliFeaturedUp[]
    onOpenUp: (mid: string) => void
}) {
    if (items.length === 0) {
        return null
    }
    return (
        <Section
            title="精选UP主"
            description="持续整理音乐内容"
            variant="listen"
        >
            <CardsRail cardWidthClassName="w-[168px]">
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpenUp(item.id)}
                        className="group flex w-full cursor-pointer flex-col items-center gap-2.5 rounded-[18px] p-3 text-center transition-[background-color,transform] hover:bg-[var(--surface-fill)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        <AccountAvatar
                            src={item.avatarUrl}
                            name={item.name}
                            pixels={88}
                            eager
                            className="ring-1 ring-black/[0.06] transition-transform duration-[var(--duration-hover)] group-hover:scale-[1.03] dark:ring-white/[0.08]"
                        />
                        <span className="w-full min-w-0">
                            <span className="block truncate text-[14px] font-semibold tracking-[-0.02em]">
                                {item.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                                {item.fans != null
                                    ? `${new Intl.NumberFormat("zh-CN").format(item.fans)}粉丝`
                                    : item.description || "哔哩哔哩 UP"}
                            </span>
                        </span>
                    </button>
                ))}
            </CardsRail>
        </Section>
    )
}

function FeaturedCollections({
    items,
    onOpen,
}: {
    items: BilibiliFeaturedPlaylist[]
    onOpen: (collection: BilibiliFeaturedPlaylist) => void
}) {
    if (items.length === 0) {
        return null
    }

    return (
        <Section
            title="合集"
            description="UP主整理的音乐合集与系列"
            variant="listen"
        >
            <CardsRail cardWidthClassName="w-[168px]">
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpen(item)}
                        className={cn(
                            "group flex w-full cursor-pointer flex-col gap-2 text-left",
                            "rounded-[14px] focus-visible:outline-2 focus-visible:outline-ring",
                        )}
                    >
                        <Cover
                            src={item.coverUrl}
                            alt={item.title}
                            size="xl"
                            className="transition-transform duration-[var(--duration-hover)] group-hover:scale-[1.02]"
                        />
                        <span className="w-full min-w-0 px-0.5">
                            <span className="block truncate text-[13px] font-semibold">
                                {item.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                                {item.count != null ? `${item.count}首` : "UP主合集"}
                            </span>
                        </span>
                    </button>
                ))}
            </CardsRail>
        </Section>
    )
}

function BilibiliPage({ onNavigate }: BilibiliPageProps) {
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openBilibiliCollection, openBilibiliUp } = useMusicNavigation()
    const [shelves, setShelves] = useState<BilibiliMusicShelf[]>([])
    const [featuredUps, setFeaturedUps] = useState<BilibiliFeaturedUp[]>([])
    const [featuredCollections, setFeaturedCollections] =
        useState<BilibiliFeaturedPlaylist[]>([])
    const [homeLoading, setHomeLoading] = useState(true)
    const [playlistLoading, setPlaylistLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        let active = true
        setHomeLoading(true)
        setPlaylistLoading(true)
        setError(null)
        void fetchBilibiliMusicRanking()
            .then((items) => {
                if (active) setShelves(items)
            })
            .catch((reason: unknown) => {
                if (!active) return
                setShelves([])
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "暂时无法获取音乐内容",
                )
            })
            .finally(() => {
                if (active) setHomeLoading(false)
            })
        void fetchBilibiliFeaturedUps()
            .then((items) => {
                if (active) setFeaturedUps(items)
            })
            .catch(() => {
                if (active) setFeaturedUps([])
            })
        void fetchBilibiliFeaturedPlaylists()
            .then((items) => {
                if (active) setFeaturedCollections(items)
            })
            .catch(() => {
                if (active) setFeaturedCollections([])
            })
            .finally(() => {
                if (active) setPlaylistLoading(false)
            })
        return () => {
            active = false
        }
    }, [revision])

    const refresh = useCallback(() => {
        setRevision((value) => value + 1)
    }, [])

    const featuredShelf = shelves[0]
    const featuredTrack = featuredShelf?.tracks[0]

    return (
        <div className="space-y-8 pb-4">
            <PageTitle
                title="哔哩哔哩"
                subtitle="现在就听 ·热门、排行与现场"
                trailing={
                    <>
                        <button
                            type="button"
                            title="搜索B站音乐"
                            aria-label="搜索B站音乐"
                            onClick={() => onNavigate("search")}
                            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-[var(--surface-fill)] text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            <Search
                                className="size-3.5"
                                aria-hidden="true"
                            />
                        </button>
                        <button
                            type="button"
                            disabled={homeLoading || playlistLoading}
                            aria-busy={homeLoading || playlistLoading}
                            onClick={refresh}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[12px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            <RefreshCw
                                className={cn(
                                    "size-3.5",
                                    (homeLoading || playlistLoading) && "animate-spin",
                                )}
                                aria-hidden="true"
                            />
                            刷新
                        </button>
                    </>
                }
            />

            {homeLoading || playlistLoading ? (
                <BilibiliHomeSkeleton />
            ) : error ? (
                <StateHero
                    variant="error"
                    title="音乐内容暂时不可用"
                    description={`${error}。检查网络后重试`}
                    action={
                        <HeroRetryButton onClick={refresh}>
                            重新加载
                        </HeroRetryButton>
                    }
                />
            ) : shelves.length === 0 ? (
                <StateHero
                    variant="empty"
                    title="暂时没有音乐内容"
                    description="可以前往搜索页查找歌曲、翻唱或音乐现场"
                    action={
                        <HeroRetryButton onClick={() => onNavigate("search")}>
                            搜索音乐
                        </HeroRetryButton>
                    }
                />
            ) : (
                <>
                    {featuredShelf && featuredTrack ? (
                        <FeaturedTrack
                            track={featuredTrack}
                            queue={featuredShelf.tracks}
                            currentTrackId={currentTrack?.id}
                            isPlaying={isPlaying}
                            playOrToggle={playOrToggle}
                        />
                    ) : null}

                    <FeaturedUps
                        items={featuredUps}
                        onOpenUp={openBilibiliUp}
                    />

                    <FeaturedCollections
                        items={featuredCollections}
                        onOpen={(collection) =>
                            openBilibiliCollection({
                                mid: String(collection.mid),
                                collectionId: String(collection.collectionId),
                                kind: collection.kind === "series" ? "series" : "season",
                            })
                        }
                    />

                    {shelves.map((shelf) => (
                        <Section
                            key={shelf.id}
                            title={shelf.title}
                            description={`${shelf.id === "popular" && featuredTrack
                                    ? shelf.tracks.filter((track) => track.id !== featuredTrack.id).length
                                    : shelf.tracks.length
                                }首`}
                            variant="listen"
                        >
                            <TrackColumns
                                tracks={
                                    shelf.id === "popular" && featuredTrack
                                        ? shelf.tracks.filter(
                                            (track) => track.id !== featuredTrack.id,
                                        )
                                        : shelf.tracks
                                }
                                currentTrackId={currentTrack?.id}
                                isPlaying={isPlaying}
                                playOrToggle={playOrToggle}
                            />
                        </Section>
                    ))}

                </>
            )}
        </div>
    )
}

export { BilibiliPage }
