import { useEffect, useMemo, useState } from "react"

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
/** 为你推荐横滑上限 */
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
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
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
                        "group relative flex w-full cursor-pointer overflow-hidden rounded-[22px] text-left",
                        "bg-black/[0.03] ring-1 ring-black/[0.04] transition-transform duration-200",
                        "active:scale-[0.99] dark:bg-white/[0.04] dark:ring-white/[0.06]",
                    )}
                >
                    <div className="relative hidden aspect-square w-[168px] shrink-0 sm:block md:w-[200px]">
                        <Cover
                            src={featured.coverUrl}
                            alt={featured.title}
                            size="xl"
                            className="size-full rounded-none"
                        />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5 sm:p-6">
                        <p className="text-[12px] font-semibold tracking-[0.04em] text-primary uppercase">
                            精选歌单
                        </p>
                        <p className="line-clamp-2 text-[26px] font-bold tracking-[-0.04em] text-foreground sm:text-[30px]">
                            {featured.title}
                        </p>
                        <p className="line-clamp-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
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
                title="为你推荐"
                description="精选歌单"
                variant="listen"
                action={
                    playlistStatus === "ready" && forYouPlaylists.length > 0 ? (
                        <RailControls api={forYouRail.api} />
                    ) : null
                }
            >
                {playlistStatus === "loading" ? (
                    <PlaylistGridSkeleton
                        count={Math.min(skeletonCount, 6)}
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
                                className="min-w-0 overflow-hidden rounded-[16px] border border-black/[0.05] bg-black/[0.02] p-1 dark:border-white/[0.06] dark:bg-white/[0.03]"
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
                    <PlaylistGridSkeleton count={6} style={playlistGridStyle} />
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