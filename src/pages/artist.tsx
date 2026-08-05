import { useEffect, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { ArtistDetailSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    fetchArtistDesc,
    fetchArtistDetail,
    fetchArtistMvs,
    fetchSimiArtists,
    type ArtistAlbumCard,
    type ArtistDescResult,
    type ArtistMvCard,
    type ArtistProfile,
    type SimiArtistCard,
} from "@/lib/netease/artist"
import { formatError, notifyFromError } from "@/lib/notify"
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
    const { openAlbum, openArtist, openMv } = useMusicNavigation()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()

    const [tab, setTab] = useState<ArtistTab>("songs")
    const [profile, setProfile] = useState<ArtistProfile | null>(null)
    const [hotTracks, setHotTracks] = useState<Track[]>([])
    const [albums, setAlbums] = useState<ArtistAlbumCard[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)

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
                setAlbums(result.albums)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setProfile(null)
                setHotTracks([])
                setAlbums([])
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("歌手加载失败", err)
            })

        return () => {
            cancelled = true
        }
    }, [artistId, retry])

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
    }, [tab, artistId, profile?.id])

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
    }, [tab, artistId, profile?.id])

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
                    <header className="flex flex-wrap items-end gap-5">
                        <Cover
                            src={profile.coverUrl}
                            alt={profile.name}
                            size="lg"
                            className="size-36 rounded-full shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.1]"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <p className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                                艺人
                            </p>
                            <h1 className="text-[32px] font-semibold tracking-[-0.04em]">
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
                                <button
                                    type="button"
                                    onClick={() => playTrack(hotTracks[0], hotTracks)}
                                    className="mt-1 h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium active:scale-[0.98]"
                                >
                                    播放热门
                                </button>
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
                                <VirtualList
                                    items={hotTracks}
                                    itemHeight={58}
                                    className="apple-list-surface p-1.5"
                                    getItemKey={(track) => track.id}
                                    renderItem={(track, index) => (
                                        <TrackRow
                                            track={track}
                                            index={index}
                                            isActive={currentTrack?.id === track.id}
                                            isPlaying={
                                                currentTrack?.id === track.id &&
                                                isPlaying
                                            }
                                            showSource={false}
                                            onPlay={(item) =>
                                                playOrToggle(item, hotTracks)
                                            }
                                        />
                                    )}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="albums" className="outline-none">
                            {albums.length === 0 ? (
                                <StateHero variant="empty" title="暂无专辑" />
                            ) : (
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
                                                setMvs(emptyLazy([]))
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
                                                "transition-transform active:scale-[0.98]",
                                            )}
                                        >
                                            <div className="relative overflow-hidden rounded-[14px] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                                                <Cover
                                                    src={mv.coverUrl}
                                                    alt={mv.title}
                                                    size="xl"
                                                    className="aspect-video w-full rounded-[14px] object-cover transition-transform duration-300 group-hover:scale-[1.03]"
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
                                                setSimilar(emptyLazy([]))
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
                                                "bg-black/[0.03] transition-colors hover:bg-black/[0.05] active:scale-[0.98]",
                                                "dark:bg-white/[0.04] dark:hover:bg-white/[0.07]",
                                            )}
                                        >
                                            <Cover
                                                src={artist.coverUrl}
                                                alt={artist.name}
                                                size="xl"
                                                className="rounded-full transition-transform duration-200 group-hover:scale-[1.03]"
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