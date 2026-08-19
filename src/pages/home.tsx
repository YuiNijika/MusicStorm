import { useCallback, useEffect, useMemo, useState } from "react"

import { Radio as RadioIcon } from "lucide-react"

import { Cover } from "@/components/music/cover"
import {
    DailyColumnsSkeleton,
    PlaylistGridSkeleton,
} from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import {
    CardsRail,
    GridPageRail,
    RailControls,
    useRailApi,
} from "@/components/music/media-rail"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import {
    PLAYLIST_FETCH_MAX,
    usePlaylistGrid,
} from "@/hooks/use-playlist-grid"
import { fetchHomeRadios } from "@/lib/netease/dj"
import { fetchPersonalFm, fmTrash } from "@/lib/netease/fm"
import { fetchRecommendPlaylists } from "@/lib/netease/playlist"
import { fetchDailyRecommendSongs } from "@/lib/netease/recommend"
import { notifyError } from "@/lib/notify"
import type { Playlist, Radio, Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type HomePageProps = {
    onOpenPlaylist: (playlistId: string) => void
    onOpenRadio: (radioId: string) => void
}

const DAILY_LIMIT = 24
const FOR_YOU_MAX = 24
const RADIO_LIMIT = 18

function splitIntoColumns<T>(items: T[], columns: number): T[][] {
    if (items.length === 0) {
        return Array.from({ length: columns }, () => [])
    }
    const size = Math.ceil(items.length / columns)
    return Array.from({ length: columns }, (_, col) =>
        items.slice(col * size, col * size + size),
    )
}

function HomePage({ onOpenPlaylist, onOpenRadio }: HomePageProps) {
    const { playOrToggle, playTrack, currentTrack, isPlaying } = usePlayer()
    const { ready, loggedIn, profile } = useNeteaseSession()
    const {
        cols,
        count: skeletonCount,
        gridStyle: playlistGridStyle,
    } = usePlaylistGrid()

    const forYouRail = useRailApi()
    const moreRail = useRailApi()
    const radioRail = useRailApi()

    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [playlistStatus, setPlaylistStatus] = useState<
        "loading" | "ready" | "error"
    >("loading")
    const [playlistRetry, setPlaylistRetry] = useState(0)

    const [daily, setDaily] = useState<Track[]>([])
    const [dailyStatus, setDailyStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [dailyRetry, setDailyRetry] = useState(0)

    const [radios, setRadios] = useState<Radio[]>([])
    const [radioStatus, setRadioStatus] = useState<
        "loading" | "ready" | "error"
    >("loading")
    const [radioRetry, setRadioRetry] = useState(0)

    const [fmTracks, setFmTracks] = useState<Track[]>([])
    const [fmStatus, setFmStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [fmActive, setFmActive] = useState(false)

    const startFm = useCallback(async () => {
        setFmStatus("loading")
        try {
            const tracks = await fetchPersonalFm()
            setFmTracks(tracks)
            setFmStatus("ready")
            if (tracks.length > 0) {
                setFmActive(true)
                playTrack(tracks[0]!, tracks)
            }
        } catch (error) {
            setFmTracks([])
            setFmStatus("error")
            notifyError("私人 FM 加载失败", {
                description:
                    error instanceof Error
                        ? error.message
                        : "请检查网络或 API 设置",
            })
        }
    }, [playTrack])

    const trashCurrentFm = useCallback(async () => {
        if (currentTrack) {
            void fmTrash(currentTrack.id).catch(() => {
                // 垃圾桶失败不打断切换，静默忽略
            })
        }
        const index = fmTracks.findIndex((item) => item.id === currentTrack?.id)
        const next = fmTracks[index + 1]
        if (next) {
            playTrack(next, fmTracks)
        } else {
            await startFm()
        }
    }, [currentTrack, fmTracks, playTrack, startFm])

    const dailyColumns = useMemo(() => splitIntoColumns(daily, 3), [daily])

    const dateLabel = useMemo(() => {
        const now = new Date()
        return `${now.getMonth() + 1}月${now.getDate()}日`
    }, [])

    const greeting = useMemo(() => {
        const hour = new Date().getHours()
        if (hour < 6) return "夜深了"
        if (hour < 12) return "早上好"
        if (hour < 18) return "下午好"
        return "晚上好"
    }, [])

    useEffect(() => {
        let cancelled = false
        setPlaylistStatus("loading")
        void fetchRecommendPlaylists(PLAYLIST_FETCH_MAX)
            .then((items) => {
                if (cancelled) {
                    return
                }
                setPlaylists(items)
                setPlaylistStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setPlaylists([])
                setPlaylistStatus("error")
                notifyError("推荐歌单加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [playlistRetry])

    useEffect(() => {
        if (!ready) {
            return
        }
        if (!loggedIn) {
            setDaily([])
            setDailyStatus("idle")
            return
        }

        let cancelled = false
        setDailyStatus("loading")
        void fetchDailyRecommendSongs()
            .then((tracks) => {
                if (cancelled) {
                    return
                }
                setDaily(tracks.slice(0, DAILY_LIMIT))
                setDailyStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setDaily([])
                setDailyStatus("error")
                notifyError("每日推荐加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [ready, loggedIn, dailyRetry])

    useEffect(() => {
        let cancelled = false
        setRadioStatus("loading")
        void fetchHomeRadios(RADIO_LIMIT)
            .then((items) => {
                if (cancelled) {
                    return
                }
                setRadios(items)
                setRadioStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setRadios([])
                setRadioStatus("error")
                notifyError("播客电台加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [radioRetry])

    const featured = playlists[0]

    const forYouPlaylists = useMemo(() => {
        const pool = playlists.length > 1 ? playlists.slice(1) : playlists
        return pool.slice(0, FOR_YOU_MAX)
    }, [playlists])

    // 更多歌单 避开 Hero + 为你推荐已展示的，其余全量进分页 carousel
    const morePlaylists = useMemo(() => {
        const used = new Set(forYouPlaylists.map((item) => item.id))
        if (featured) {
            used.add(featured.id)
        }
        const rest = playlists.filter((item) => !used.has(item.id))
        return rest.length > 0 ? rest : playlists.filter((p) => p.id !== featured?.id)
    }, [playlists, forYouPlaylists, featured])

    return (
        <div className="space-y-8 pb-4">
            <PageTitle
                title="现在就听"
                subtitle={
                    loggedIn && profile?.nickname
                        ? `${greeting}，${profile.nickname}`
                        : `${greeting} · 发现今日好音乐`
                }
            />

            {featured && playlistStatus === "ready" ? (
                <button
                    type="button"
                    onClick={() => onOpenPlaylist(featured.id)}
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
                            src={featured.coverUrl}
                            alt={featured.title}
                            size="xl"
                            className="size-full rounded-none transition-transform duration-[var(--duration-enter)] ease-[var(--ease-enter)] group-hover:scale-[1.03]"
                        />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-4 sm:gap-2 sm:p-6">
                        <p className="text-[11px] font-semibold tracking-[0.04em] text-primary uppercase sm:text-[12px]">
                            精选歌单
                        </p>
                        <p className="line-clamp-2 text-[22px] font-bold tracking-[-0.04em] text-foreground sm:text-[26px] md:text-[30px]">
                            {featured.title}
                        </p>
                        <p className="line-clamp-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">
                            {featured.description ||
                                (featured.trackCount
                                    ? `${featured.trackCount} 首歌曲`
                                    : "为你推荐")}
                        </p>
                    </div>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/[0.03] dark:to-white/[0.04]"
                    />
                </button>
            ) : null}

            <Section
                title="私人 FM"
                description="红心电台 · 猜你喜欢"
                variant="listen"
            >
                {!loggedIn ? (
                    <StateHero
                        variant="auth"
                        title="登录后开启私人 FM"
                        description="基于你的红心歌曲智能推荐"
                    />
                ) : fmStatus === "loading" ? (
                    <div className="apple-list-surface flex h-20 items-center gap-3 p-3">
                        <div className="size-12 animate-pulse rounded-xl bg-[var(--surface-fill)]" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-fill)]" />
                            <div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-fill)]" />
                        </div>
                    </div>
                ) : fmStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="私人 FM 加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton onClick={() => void startFm()} />
                        }
                    />
                ) : !fmActive ? (
                    <button
                        type="button"
                        onClick={() => void startFm()}
                        className="apple-list-surface flex w-full cursor-pointer items-center gap-4 p-3 text-left transition-[background-color,transform] duration-[var(--duration-hover)] hover:bg-[var(--surface-fill-hover)] active:scale-[0.995]"
                    >
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <RadioIcon className="size-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold tracking-[-0.01em]">
                                开启私人 FM
                            </p>
                            <p className="mt-0.5 text-[13px] text-muted-foreground">
                                连续播放你可能会喜欢的歌
                            </p>
                        </div>
                    </button>
                ) : (
                    <div className="apple-list-surface flex items-center gap-4 p-3">
                        <Cover
                            src={currentTrack?.coverUrl ?? ""}
                            alt={currentTrack?.title ?? "私人 FM"}
                            size="md"
                            className="size-14 shrink-0 rounded-xl"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                                {currentTrack?.title ?? "私人 FM"}
                            </p>
                            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                                {currentTrack?.artist ?? "未知艺人"}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void trashCurrentFm()}
                            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            下一首
                        </button>
                    </div>
                )}
            </Section>

            <Section
                title="为你推荐"
                description="根据你的口味精选"
                variant="listen"
                action={
                    playlistStatus === "ready" && forYouPlaylists.length > 0 ? (
                        <RailControls api={forYouRail.api} />
                    ) : null
                }
            >
                {playlistStatus === "loading" ? (
                    <PlaylistGridSkeleton
                        count={Math.min(skeletonCount, 5)}
                        style={playlistGridStyle}
                    />
                ) : playlistStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="推荐歌单加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setPlaylistRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : forYouPlaylists.length === 0 ? (
                    <StateHero variant="empty" title="暂无推荐歌单" />
                ) : (
                    <CardsRail setApi={forYouRail.setApi}>
                        {forYouPlaylists.map((playlist) => (
                            <MediaCard
                                key={playlist.id}
                                coverUrl={playlist.coverUrl}
                                title={playlist.title}
                                subtitle={
                                    playlist.trackCount
                                        ? `${playlist.trackCount} 首`
                                        : "歌单"
                                }
                                onClick={() => onOpenPlaylist(playlist.id)}
                                widthClassName="w-full"
                            />
                        ))}
                    </CardsRail>
                )}
            </Section>

            <Section title="每日推荐" description={dateLabel} variant="listen">
                {!ready || dailyStatus === "loading" ? (
                    <DailyColumnsSkeleton />
                ) : !loggedIn ? (
                    <StateHero
                        variant="auth"
                        title="登录后查看每日推荐"
                        description="使用网易云账号登录，即可同步专属推荐"
                    />
                ) : dailyStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="每日推荐加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setDailyRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : daily.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="今日暂无推荐"
                        description="稍后再来看看"
                    />
                ) : (
                    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
                        {dailyColumns.map((column, colIndex) => (
                            <div
                                key={colIndex}
                                className="apple-list-surface min-w-0 p-1"
                            >
                                {column.map((track, index) => {
                                    const globalIndex =
                                        dailyColumns
                                            .slice(0, colIndex)
                                            .reduce((sum, col) => sum + col.length, 0) +
                                        index
                                    return (
                                        <TrackRow
                                            key={track.id}
                                            track={track}
                                            index={globalIndex}
                                            isActive={currentTrack?.id === track.id}
                                            isPlaying={
                                                currentTrack?.id === track.id && isPlaying
                                            }
                                            showSource={false}
                                            showAlbumColumn={false}
                                            showAlbumMeta={false}
                                            showActions={false}
                                            showAddToPlaylist
                                            dense
                                            onPlay={(item) => playOrToggle(item, daily)}
                                        />
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {playlistStatus === "ready" && morePlaylists.length > 0 ? (
                <Section
                    title="更多歌单"
                    variant="listen"
                    action={<RailControls api={moreRail.api} />}
                >
                    <GridPageRail
                        items={morePlaylists}
                        cols={cols}
                        setApi={moreRail.setApi}
                        getKey={(item) => item.id}
                        renderItem={(playlist) => (
                            <MediaCard
                                coverUrl={playlist.coverUrl}
                                title={playlist.title}
                                subtitle={
                                    playlist.trackCount
                                        ? `${playlist.trackCount} 首`
                                        : playlist.description || "歌单"
                                }
                                onClick={() => onOpenPlaylist(playlist.id)}
                                widthClassName="w-full"
                                className="w-full"
                            />
                        )}
                    />
                </Section>
            ) : null}

            <Section
                title="播客电台"
                description="精选与热门"
                variant="listen"
                action={
                    radioStatus === "ready" && radios.length > 0 ? (
                        <RailControls api={radioRail.api} />
                    ) : null
                }
            >
                {radioStatus === "loading" ? (
                    <PlaylistGridSkeleton count={5} style={playlistGridStyle} />
                ) : radioStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="播客加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setRadioRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : radios.length === 0 ? (
                    <StateHero variant="empty" title="暂无电台推荐" />
                ) : (
                    <CardsRail setApi={radioRail.setApi}>
                        {radios.map((radio) => (
                            <MediaCard
                                key={radio.id}
                                coverUrl={radio.coverUrl}
                                title={radio.title}
                                subtitle={
                                    radio.djName ||
                                    (radio.programCount != null
                                        ? `${radio.programCount} 期`
                                        : radio.category || "播客")
                                }
                                onClick={() => onOpenRadio(radio.id)}
                                widthClassName="w-full"
                            />
                        ))}
                    </CardsRail>
                )}
            </Section>
        </div>
    )
}

export { HomePage }