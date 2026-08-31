import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { ArtistDetailSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    fetchArtistAlbumsPage,
    fetchArtistDesc,
    fetchArtistDetail,
    fetchArtistMvs,
    fetchArtistSongsPage,
    fetchArtistSublist,
    fetchSimiArtists,
    subscribeArtist,
    type ArtistAlbumCard,
    type ArtistDescResult,
    type ArtistMvCard,
    type ArtistProfile,
    type SimiArtistCard,
} from "@/lib/netease/artist"
import { formatError, notifyFromError, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type ArtistTab = "songs" | "albums" | "mv" | "detail" | "similar"

type ArtistPageProps = {
    artistId: string
    onBack: () => void
}

type LazyState<T> = {
    status: "idle" | "loading" | "ready" | "error"
    data: T
    error: string | null
}

function emptyLazy<T>(data: T): LazyState<T> {
    return { status: "idle", data, error: null }
}

function formatPlayCount(count?: number): string {
    if (count == null) {
        return ""
    }
    if (count >= 100_000_000) {
        return `${(count / 100_000_000).toFixed(1)} 亿`
    }
    if (count >= 10_000) {
        return `${(count / 10_000).toFixed(1)} 万`
    }
    return String(count)
}

function ArtistPage({ artistId, onBack }: ArtistPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { loggedIn } = useNeteaseSession()
    const { openAlbum, openArtist, openMv } = useMusicNavigation()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()

    const [subscribed, setSubscribed] = useState(false)
    const [subBusy, setSubBusy] = useState(false)

    const [tab, setTab] = useState<ArtistTab>("songs")
    const [profile, setProfile] = useState<ArtistProfile | null>(null)
    const [hotTracks, setHotTracks] = useState<Track[]>([])
    const [albums, setAlbums] = useState<ArtistAlbumCard[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    // MV/相似 tab 各自的重试计数：error 后点重试要能重新拉请求，
    // 单纯重置 state 只会让 effect 不重跑、永远卡在加载中
    const [tabRetry, setTabRetry] = useState(0)

    // 歌曲分页，更多歌曲追加在热门 50 后，offset 从 hotTracks.length 起跳
    const [moreSongs, setMoreSongs] = useState<Track[]>([])
    const [songsOffset, setSongsOffset] = useState(0)
    const [songsLoading, setSongsLoading] = useState(false)
    const [songsHasMore, setSongsHasMore] = useState(false)
    const songsSentinelRef = useRef<HTMLDivElement>(null)

    // 歌曲全集 = 热门列表 + 分页追加（追加侧已按 id 去重），列表与播放队列共用
    const allSongs = useMemo(
        () => (moreSongs.length ? [...hotTracks, ...moreSongs] : hotTracks),
        [hotTracks, moreSongs],
    )

    // 专辑无限滚动：偏移量、加载中、是否还有下一页
    const [albumsOffset, setAlbumsOffset] = useState(0)
    const [albumsLoading, setAlbumsLoading] = useState(false)
    const [albumsHasMore, setAlbumsHasMore] = useState(true)
    const albumsSentinelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!loggedIn) {
            setSubscribed(false)
            return
        }
        let cancelled = false
        void fetchArtistSublist()
            .then((list) => {
                if (cancelled) {
                    return
                }
                setSubscribed(list.some((item) => item.id === artistId))
            })
            .catch(() => {
                // 订阅状态查询失败不阻塞，按钮按未收藏展示
            })
        return () => {
            cancelled = true
        }
    }, [loggedIn, artistId])

    async function handleToggleSub() {
        if (!loggedIn || subBusy) {
            return
        }
        setSubBusy(true)
        const next = !subscribed
        try {
            await subscribeArtist(artistId, next)
            setSubscribed(next)
            notifySuccess(next ? "已收藏歌手" : "已取消收藏", {
                description: profile?.name,
            })
        } catch (error) {
            notifyFromError("收藏歌手失败", error)
        } finally {
            setSubBusy(false)
        }
    }

    const [mvs, setMvs] = useState<LazyState<ArtistMvCard[]>>(emptyLazy([]))
    const [desc, setDesc] = useState<LazyState<ArtistDescResult>>(
        emptyLazy({ brief: "", sections: [] }),
    )
    const [similar, setSimilar] = useState<LazyState<SimiArtistCard[]>>(
        emptyLazy([]),
    )

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        setTab("songs")
        setAlbumsOffset(0)
        setAlbumsHasMore(true)
        setAlbumsLoading(false)
        setMoreSongs([])
        setSongsOffset(0)
        setSongsLoading(false)
        setSongsHasMore(false)
        setMvs(emptyLazy([]))
        setDesc(emptyLazy({ brief: "", sections: [] }))
        setSimilar(emptyLazy([]))

        void fetchArtistDetail(artistId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setProfile(result.profile)
                setHotTracks(result.hotTracks)
                // 热门 50 后再接全量分页：有总曲数按总曲数判，未知时以拉满一页为有更多
                setMoreSongs([])
                setSongsOffset(result.hotTracks.length)
                setSongsHasMore(
                    result.profile.songCount == null
                        ? result.hotTracks.length >= 50
                        : result.profile.songCount > result.hotTracks.length,
                )
                setAlbums(result.albums)
                // 首屏拿满一页（50 张）视为可能还有更多，靠下滑追加
                setAlbumsOffset(result.albums.length)
                setAlbumsHasMore(result.albums.length >= 50)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setProfile(null)
                setHotTracks([])
                setMoreSongs([])
                setSongsOffset(0)
                setSongsHasMore(false)
                setAlbums([])
                setAlbumsOffset(0)
                setAlbumsHasMore(false)
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("歌手加载失败", err)
            })

        return () => {
            cancelled = true
        }
    }, [artistId, retry])

    // 专辑无限滚动：下滑到哨兵进入视口时追加下一页，按 id 去重
    const loadMoreAlbums = useCallback(async () => {
        if (albumsLoading || !albumsHasMore) {
            return
        }
        setAlbumsLoading(true)
        try {
            const next = await fetchArtistAlbumsPage(artistId, albumsOffset)
            setAlbums((prev) => {
                const seen = new Set(prev.map((album) => album.id))
                return [...prev, ...next.filter((album) => !seen.has(album.id))]
            })
            setAlbumsOffset((offset) => offset + next.length)
            if (next.length < 50) {
                setAlbumsHasMore(false)
            }
        } catch (err) {
            notifyFromError("加载更多专辑失败", err)
        } finally {
            setAlbumsLoading(false)
        }
    }, [artistId, albumsOffset, albumsLoading, albumsHasMore])

    useEffect(() => {
        const sentinel = albumsSentinelRef.current
        if (tab !== "albums" || !albumsHasMore || !sentinel) {
            return
        }
        // rootMargin 提前 300px 触发，滚动到底前就开始加载
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    void loadMoreAlbums()
                }
            },
            { rootMargin: "300px" },
        )
        io.observe(sentinel)
        return () => io.disconnect()
    }, [tab, albumsHasMore, albumsLoading, loadMoreAlbums])

    // 歌曲追加，热门 50 之后按全量接口翻页，与热门按 id 去重
    const loadMoreSongs = useCallback(async () => {
        if (songsLoading || !songsHasMore) {
            return
        }
        setSongsLoading(true)
        try {
            const next = await fetchArtistSongsPage(artistId, songsOffset)
            setMoreSongs((prev) => {
                const seen = new Set(hotTracks.map((track) => track.id))
                for (const track of prev) {
                    seen.add(track.id)
                }
                const fresh = next.filter((track) => !seen.has(track.id))
                return [...prev, ...fresh]
            })
            setSongsOffset((offset) => offset + next.length)
            if (next.length < 50) {
                setSongsHasMore(false)
            }
        } catch (err) {
            notifyFromError("加载更多歌曲失败", err)
        } finally {
            setSongsLoading(false)
        }
    }, [artistId, songsOffset, songsLoading, songsHasMore, hotTracks])

    useEffect(() => {
        const sentinel = songsSentinelRef.current
        if (tab !== "songs" || !songsHasMore || !sentinel) {
            return
        }
        // 与专辑同款提前 300px 触底自动加载，按钮兜底手动
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    void loadMoreSongs()
                }
            },
            { rootMargin: "300px" },
        )
        io.observe(sentinel)
        return () => io.disconnect()
    }, [tab, songsHasMore, songsLoading, loadMoreSongs])

    // Tab 懒加载：勿把 status 放进 deps，否则 set loading 会 cleanup 取消请求导致永久卡 loading
    useEffect(() => {
        if (!profile || tab !== "mv") {
            return
        }
        let cancelled = false
        setMvs({ status: "loading", data: [], error: null })
        void fetchArtistMvs(artistId)
            .then((items) => {
                if (!cancelled) {
                    setMvs({ status: "ready", data: items, error: null })
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setMvs({
                        status: "error",
                        data: [],
                        error: formatError(err),
                    })
                    notifyFromError("MV 加载失败", err)
                }
            })
        return () => {
            cancelled = true
        }
    }, [tab, artistId, profile?.id, tabRetry])

    useEffect(() => {
        if (!profile || tab !== "detail") {
            return
        }
        let cancelled = false
        const briefFallback = profile.brief
        setDesc({
            status: "loading",
            data: { brief: briefFallback, sections: [] },
            error: null,
        })
        void fetchArtistDesc(artistId)
            .then((result) => {
                if (!cancelled) {
                    setDesc({
                        status: "ready",
                        data: {
                            brief: result.brief || briefFallback,
                            sections: result.sections,
                        },
                        error: null,
                    })
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setDesc({
                        status: "ready",
                        data: {
                            brief: briefFallback,
                            sections: [],
                        },
                        error: formatError(err),
                    })
                }
            })
        return () => {
            cancelled = true
        }
    }, [tab, artistId, profile?.id, profile?.brief])

    useEffect(() => {
        if (!profile || tab !== "similar") {
            return
        }
        let cancelled = false
        setSimilar({ status: "loading", data: [], error: null })
        void fetchSimiArtists(artistId)
            .then((items) => {
                if (!cancelled) {
                    setSimilar({ status: "ready", data: items, error: null })
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setSimilar({
                        status: "error",
                        data: [],
                        error: formatError(err),
                    })
                    notifyFromError("相似艺人加载失败", err)
                }
            })
        return () => {
            cancelled = true
        }
    }, [tab, artistId, profile?.id, tabRetry])

    return (
        <div className="space-y-5">
            <BackButton onClick={onBack} />

            {loading ? (
                <ArtistDetailSkeleton />
            ) : error ? (
                <StateHero
                    variant="error"
                    title="歌手加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : profile ? (
                <>
                    <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
                        <Cover
                            src={profile.coverUrl}
                            alt={profile.name}
                            size="lg"
                            className="size-32 shrink-0 rounded-full shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.1] sm:size-36"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase sm:text-[12px]">
                                艺人
                            </p>
                            <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.04em] sm:text-[28px] md:text-[32px] md:font-semibold">
                                {profile.name}
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                {[
                                    profile.songCount != null
                                        ? `${profile.songCount} 首作品`
                                        : null,
                                    profile.albumCount != null
                                        ? `${profile.albumCount} 张专辑`
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · ") || "网易云艺人"}
                            </p>
                            {hotTracks[0] ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            playTrack(hotTracks[0], hotTracks)
                                        }
                                        className="h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
                                    >
                                        播放热门
                                    </button>
                                    {loggedIn ? (
                                        <button
                                            type="button"
                                            disabled={subBusy}
                                            onClick={() => void handleToggleSub()}
                                            className={cn(
                                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50",
                                                subscribed
                                                    ? "bg-primary/15 text-primary"
                                                    : "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
                                            )}
                                        >
                                            {subscribed ? "已收藏" : "收藏"}
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </header>

                    <Tabs
                        value={tab}
                        onValueChange={(value) => {
                            if (
                                value === "songs" ||
                                value === "albums" ||
                                value === "mv" ||
                                value === "detail" ||
                                value === "similar"
                            ) {
                                setTab(value)
                            }
                        }}
                        className="gap-4"
                    >
                        <TabsList
                            variant="line"
                            className="h-auto w-full max-w-full flex-wrap justify-start gap-0 overflow-x-auto"
                        >
                            <TabsTrigger value="songs" className="px-3">
                                歌曲
                            </TabsTrigger>
                            <TabsTrigger value="albums" className="px-3">
                                专辑
                            </TabsTrigger>
                            <TabsTrigger value="mv" className="px-3">
                                MV
                            </TabsTrigger>
                            <TabsTrigger value="detail" className="px-3">
                                详情
                            </TabsTrigger>
                            <TabsTrigger value="similar" className="px-3">
                                相似
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="songs" className="outline-none">
                            {hotTracks.length === 0 ? (
                                <StateHero variant="empty" title="暂无热门歌曲" />
                            ) : (
                                <>
                                    <VirtualList
                                        items={allSongs}
                                        itemHeight={58}
                                        className="apple-list-surface p-1.5"
                                        getItemKey={(track) => track.id}
                                        renderItem={(track, index) => (
                                            <TrackRow
                                                track={track}
                                                index={index}
                                                isActive={
                                                    currentTrack?.id === track.id
                                                }
                                                isPlaying={
                                                    currentTrack?.id ===
                                                        track.id && isPlaying
                                                }
                                                showSource={false}
                                                onPlay={(item) =>
                                                    playOrToggle(item, allSongs)
                                                }
                                            />
                                        )}
                                    />
                                    {/* 下滑哨兵 + 状态区：热门 50 后接全量歌曲分页 */}
                                    <div
                                        ref={songsSentinelRef}
                                        className="h-1"
                                        aria-hidden
                                    />
                                    <div className="flex flex-col items-center gap-3 py-6">
                                        {songsLoading ? (
                                            <p className="text-[12px] text-muted-foreground">
                                                加载中…
                                            </p>
                                        ) : songsHasMore ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void loadMoreSongs()
                                                }
                                                className="inline-flex h-9 cursor-pointer items-center rounded-full bg-[var(--surface-fill)] px-5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                                            >
                                                加载更多
                                            </button>
                                        ) : (
                                            <p className="text-[12px] text-muted-foreground">
                                                没有更多歌曲了
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="albums" className="outline-none">
                            {albums.length === 0 ? (
                                <StateHero variant="empty" title="暂无专辑" />
                            ) : (
                                <>
                                    <div ref={gridRef} className={gridClass} style={gridStyle}>
                                        {albums.map((album) => (
                                            <MediaCard
                                                key={album.id}
                                                coverUrl={album.coverUrl}
                                                title={album.title}
                                                subtitle={
                                                    [
                                                        album.year,
                                                        album.trackCount
                                                            ? `${album.trackCount} 首`
                                                            : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" · ") || "专辑"
                                                }
                                                widthClassName="w-full"
                                                onClick={() => openAlbum(album.id)}
                                            />
                                        ))}
                                    </div>
                                    {/* 下滑追加哨兵：进入视口触发下一页 */}
                                    <div
                                        ref={albumsSentinelRef}
                                        className="h-1"
                                        aria-hidden
                                    />
                                    {/* 状态区：加载中 / 还有下一页的手动按钮 / 到底提示；
                                        下滑哨兵与按钮双通道，自动触发失败时点按钮兜底 */}
                                    <div className="flex flex-col items-center gap-3 py-6">
                                        {albumsLoading ? (
                                            <p className="text-[12px] text-muted-foreground">
                                                加载中…
                                            </p>
                                        ) : albumsHasMore ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void loadMoreAlbums()
                                                }
                                                className="inline-flex h-9 cursor-pointer items-center rounded-full bg-[var(--surface-fill)] px-5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                                            >
                                                加载更多
                                            </button>
                                        ) : (
                                            <p className="text-[12px] text-muted-foreground">
                                                没有更多专辑了
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="mv" className="outline-none">
                            {mvs.status === "loading" || mvs.status === "idle" ? (
                                <p className="py-8 text-center text-[13px] text-muted-foreground">
                                    加载 MV…
                                </p>
                            ) : mvs.status === "error" ? (
                                <StateHero
                                    variant="error"
                                    title="MV 加载失败"
                                    description={mvs.error ?? ""}
                                    action={
                                        <HeroRetryButton
                                            onClick={() =>
                                                setTabRetry((n) => n + 1)
                                            }
                                        />
                                    }
                                />
                            ) : mvs.data.length === 0 ? (
                                <StateHero variant="empty" title="暂无 MV" />
                            ) : (
                                <div
                                    className="grid gap-4"
                                    style={{
                                        gridTemplateColumns:
                                            "repeat(auto-fill, minmax(180px, 1fr))",
                                    }}
                                >
                                    {mvs.data.map((mv) => (
                                        <button
                                            key={mv.id}
                                            type="button"
                                            onClick={() => openMv(mv.id)}
                                            className={cn(
                                                "group flex cursor-pointer flex-col gap-2 text-left",
                                                "transition-transform active:scale-[0.98] active:duration-[var(--duration-press)]",
                                            )}
                                        >
                                            <div className="relative overflow-hidden rounded-[14px] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                                                <Cover
                                                    src={mv.coverUrl}
                                                    alt={mv.title}
                                                    size="xl"
                                                    className="aspect-video w-full rounded-[14px] object-cover transition-transform duration-[var(--duration-enter)] ease-[var(--ease-enter)] group-hover:scale-[1.03]"
                                                />
                                                {mv.playCount != null ? (
                                                    <span className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                                                        {formatPlayCount(mv.playCount)} 次
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="min-w-0 px-0.5">
                                                <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">
                                                    {mv.title}
                                                </p>
                                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                    {mv.artistName || "MV"}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="detail" className="outline-none">
                            {desc.status === "loading" || desc.status === "idle" ? (
                                <p className="py-8 text-center text-[13px] text-muted-foreground">
                                    加载详情…
                                </p>
                            ) : (
                                <div className="material-panel space-y-5 rounded-[22px] px-5 py-4">
                                    {desc.data.brief ? (
                                        <div className="space-y-1.5">
                                            <p className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                                                简介
                                            </p>
                                            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">
                                                {desc.data.brief}
                                            </p>
                                        </div>
                                    ) : null}
                                    {desc.data.sections.map((section, index) => (
                                        <div key={`${section.title}-${index}`} className="space-y-1.5">
                                            <p className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                                                {section.title}
                                            </p>
                                            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">
                                                {section.text}
                                            </p>
                                        </div>
                                    ))}
                                    {!desc.data.brief &&
                                    desc.data.sections.length === 0 ? (
                                        <StateHero
                                            variant="empty"
                                            title="暂无详细介绍"
                                        />
                                    ) : null}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="similar" className="outline-none">
                            {similar.status === "loading" ||
                            similar.status === "idle" ? (
                                <p className="py-8 text-center text-[13px] text-muted-foreground">
                                    加载相似艺人…
                                </p>
                            ) : similar.status === "error" ? (
                                <StateHero
                                    variant="error"
                                    title="相似艺人加载失败"
                                    description={similar.error ?? ""}
                                    action={
                                        <HeroRetryButton
                                            onClick={() =>
                                                setTabRetry((n) => n + 1)
                                            }
                                        />
                                    }
                                />
                            ) : similar.data.length === 0 ? (
                                <StateHero variant="empty" title="暂无相似艺人" />
                            ) : (
                                <div
                                    ref={gridRef}
                                    className={gridClass}
                                    style={gridStyle}
                                >
                                    {similar.data.map((artist) => (
                                        <button
                                            key={artist.id}
                                            type="button"
                                            onClick={() => openArtist(artist.id)}
                                            className={cn(
                                                "group flex cursor-pointer flex-col items-center gap-2.5 rounded-[20px] p-3 text-center",
                                                "bg-[var(--surface-fill)] transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.98] active:duration-[var(--duration-press)]",
                                            )}
                                        >
                                            <Cover
                                                src={artist.coverUrl}
                                                alt={artist.name}
                                                size="xl"
                                                className="rounded-full transition-transform duration-[var(--duration-hover)] group-hover:scale-[1.03]"
                                            />
                                            <div className="min-w-0 w-full px-0.5">
                                                <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">
                                                    {artist.name}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                    {artist.albumCount != null
                                                        ? `${artist.albumCount} 张专辑`
                                                        : "艺人"}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </>
            ) : null}
        </div>
    )
}

export { ArtistPage }