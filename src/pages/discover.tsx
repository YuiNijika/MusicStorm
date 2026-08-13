import { useEffect, useState } from "react"

import { PlaylistGridSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { useInViewOnce } from "@/hooks/use-in-view-once"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import type { AlbumCard } from "@/lib/netease/album"
import {
    fetchNewAlbums,
    fetchTopSongs,
    type AlbumArea,
} from "@/lib/netease/discover"
import { fetchTopPlaylists } from "@/lib/netease/playlist"
import { fetchToplists, type ToplistItem } from "@/lib/netease/toplist"
import { notifyError } from "@/lib/notify"
import type { Playlist, Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type DiscoverPageProps = {
    onOpenPlaylist: (playlistId: string) => void
    onOpenAlbum: (albumId: string) => void
}

const ALBUM_AREAS: Array<{ value: AlbumArea; label: string }> = [
    { value: "ALL", label: "全部" },
    { value: "ZH", label: "华语" },
    { value: "EA", label: "欧美" },
    { value: "KR", label: "韩国" },
    { value: "JP", label: "日本" },
]

// 新歌速递地区 type：0 全部 / 7 华语 / 96 欧美 / 8 日本 / 16 韩国
const SONG_AREAS: Array<{ value: number; label: string }> = [
    { value: 0, label: "全部" },
    { value: 7, label: "华语" },
    { value: 96, label: "欧美" },
    { value: 8, label: "日本" },
    { value: 16, label: "韩国" },
]

// 分类歌单 cat：常用分类子集
const PLAYLIST_CATS = [
    "华语",
    "欧美",
    "日语",
    "韩语",
    "流行",
    "摇滚",
    "民谣",
    "电子",
    "说唱",
    "爵士",
    "古典",
    "影视原声",
    "ACG",
    "轻音乐",
]

// 每批展示数量：首屏少输出，点「加载更多」再补一批
const PAGE_SIZE = 12

function LoadMoreButton({
    visible,
    loading,
    onClick,
}: {
    visible: boolean
    loading: boolean
    onClick: () => void
}) {
    if (!visible) {
        return null
    }
    return (
        <div className="flex justify-center pt-1">
            <button
                type="button"
                disabled={loading}
                onClick={onClick}
                className="inline-flex h-9 cursor-pointer items-center rounded-full bg-[var(--surface-fill)] px-5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
            >
                {loading ? "加载中…" : "加载更多"}
            </button>
        </div>
    )
}

function AreaFilter<T extends string | number>({
    options,
    value,
    onChange,
}: {
    options: Array<{ value: T; label: string }>
    value: T
    onChange: (next: T) => void
}) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {options.map((option) => {
                const active = option.value === value
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "inline-flex h-7 cursor-pointer items-center rounded-full px-3 text-[12px] font-medium transition-colors",
                            active
                                ? "bg-foreground text-background"
                                : "bg-[var(--surface-fill)] text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                        )}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}

function DiscoverPage({ onOpenPlaylist, onOpenAlbum }: DiscoverPageProps) {
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { count: skeletonCount, gridClass, gridStyle, gridRef } =
        usePlaylistGrid()

    // 首屏只加载排行榜，其余区块滚动到附近再拉取，避免一次性请求+渲染过多卡片
    const albumsSection = useInViewOnce<HTMLDivElement>()
    const songsSection = useInViewOnce<HTMLDivElement>()
    const catSection = useInViewOnce<HTMLDivElement>()

    const [toplists, setToplists] = useState<ToplistItem[]>([])
    const [toplistStatus, setToplistStatus] = useState<
        "loading" | "ready" | "error"
    >("loading")
    const [toplistRetry, setToplistRetry] = useState(0)
    const [toplistShown, setToplistShown] = useState(PAGE_SIZE)

    const [albumArea, setAlbumArea] = useState<AlbumArea>("ALL")
    const [albums, setAlbums] = useState<AlbumCard[]>([])
    const [albumStatus, setAlbumStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [albumRetry, setAlbumRetry] = useState(0)
    const [albumHasMore, setAlbumHasMore] = useState(false)
    const [albumLoadingMore, setAlbumLoadingMore] = useState(false)

    const [songType, setSongType] = useState(0)
    const [songs, setSongs] = useState<Track[]>([])
    const [songStatus, setSongStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [songRetry, setSongRetry] = useState(0)
    const [songShown, setSongShown] = useState(PAGE_SIZE)

    const [playlistCat, setPlaylistCat] = useState("华语")
    const [catPlaylists, setCatPlaylists] = useState<Playlist[]>([])
    const [catStatus, setCatStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [catRetry, setCatRetry] = useState(0)
    const [catHasMore, setCatHasMore] = useState(false)
    const [catLoadingMore, setCatLoadingMore] = useState(false)

    useEffect(() => {
        let cancelled = false
        setToplistStatus("loading")
        void fetchToplists()
            .then((items) => {
                if (cancelled) {
                    return
                }
                setToplists(items)
                setToplistStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setToplists([])
                setToplistStatus("error")
                notifyError("排行榜加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [toplistRetry])

    useEffect(() => {
        if (!albumsSection.isInView) {
            return
        }
        let cancelled = false
        setAlbumStatus("loading")
        void fetchNewAlbums(albumArea, PAGE_SIZE, 0)
            .then((items) => {
                if (cancelled) {
                    return
                }
                setAlbums(items)
                setAlbumHasMore(items.length === PAGE_SIZE)
                setAlbumStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setAlbums([])
                setAlbumHasMore(false)
                setAlbumStatus("error")
                notifyError("新碟上架加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [albumArea, albumRetry, albumsSection.isInView])

    async function loadMoreAlbums() {
        if (albumLoadingMore || albumStatus !== "ready") {
            return
        }
        setAlbumLoadingMore(true)
        try {
            const items = await fetchNewAlbums(albumArea, PAGE_SIZE, albums.length)
            setAlbums((prev) => [...prev, ...items])
            setAlbumHasMore(items.length === PAGE_SIZE)
        } catch (error) {
            notifyError("加载更多失败", {
                description:
                    error instanceof Error ? error.message : "请稍后再试",
            })
        } finally {
            setAlbumLoadingMore(false)
        }
    }

    useEffect(() => {
        if (!songsSection.isInView) {
            return
        }
        let cancelled = false
        setSongStatus("loading")
        void fetchTopSongs(songType)
            .then((items) => {
                if (cancelled) {
                    return
                }
                setSongs(items)
                setSongShown(PAGE_SIZE)
                setSongStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setSongs([])
                setSongStatus("error")
                notifyError("新歌速递加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [songType, songRetry, songsSection.isInView])

    useEffect(() => {
        if (!catSection.isInView) {
            return
        }
        let cancelled = false
        setCatStatus("loading")
        void fetchTopPlaylists(playlistCat, "hot", PAGE_SIZE, 0)
            .then((items) => {
                if (cancelled) {
                    return
                }
                setCatPlaylists(items)
                setCatHasMore(items.length === PAGE_SIZE)
                setCatStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setCatPlaylists([])
                setCatHasMore(false)
                setCatStatus("error")
                notifyError("分类歌单加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络或 API 设置",
                })
            })
        return () => {
            cancelled = true
        }
    }, [playlistCat, catRetry, catSection.isInView])

    async function loadMoreCat() {
        if (catLoadingMore || catStatus !== "ready") {
            return
        }
        setCatLoadingMore(true)
        try {
            const items = await fetchTopPlaylists(
                playlistCat,
                "hot",
                PAGE_SIZE,
                catPlaylists.length,
            )
            setCatPlaylists((prev) => [...prev, ...items])
            setCatHasMore(items.length === PAGE_SIZE)
        } catch (error) {
            notifyError("加载更多失败", {
                description:
                    error instanceof Error ? error.message : "请稍后再试",
            })
        } finally {
            setCatLoadingMore(false)
        }
    }

    return (
        <div className="space-y-8 pb-4">
            <PageTitle title="发现" subtitle="官方榜单 · 新碟 · 新歌速递" />

            <Section
                title="排行榜"
                description="官方榜单实时更新"
                variant="listen"
            >
                {toplistStatus === "loading" ? (
                    <PlaylistGridSkeleton
                        count={Math.min(skeletonCount, 5)}
                        style={gridStyle}
                    />
                ) : toplistStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="排行榜加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setToplistRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : toplists.length === 0 ? (
                    <StateHero variant="empty" title="暂无榜单" />
                ) : (
                    <>
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {toplists.slice(0, toplistShown).map((item) => (
                                <MediaCard
                                    key={item.id}
                                    coverUrl={item.coverUrl}
                                    title={item.title}
                                    subtitle={item.description || "榜单"}
                                    onClick={() => onOpenPlaylist(item.id)}
                                    widthClassName="w-full"
                                    className="w-full"
                                />
                            ))}
                        </div>
                        <LoadMoreButton
                            visible={toplistShown < toplists.length}
                            loading={false}
                            onClick={() =>
                                setToplistShown((n) => n + PAGE_SIZE)
                            }
                        />
                    </>
                )}
            </Section>

            <div ref={albumsSection.ref}>
            <Section
                title="新碟上架"
                description="最新发行专辑"
                variant="listen"
                action={
                    <AreaFilter
                        options={ALBUM_AREAS}
                        value={albumArea}
                        onChange={setAlbumArea}
                    />
                }
            >
                {albumStatus === "idle" || albumStatus === "loading" ? (
                    <PlaylistGridSkeleton
                        count={Math.min(skeletonCount, 5)}
                        style={gridStyle}
                    />
                ) : albumStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="新碟上架加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setAlbumRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : albums.length === 0 ? (
                    <StateHero variant="empty" title="暂无新碟" />
                ) : (
                    <>
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {albums.map((album) => (
                                <MediaCard
                                    key={album.id}
                                    coverUrl={album.coverUrl}
                                    title={album.title}
                                    subtitle={
                                        album.artistName
                                            ? `${album.artistName}${
                                                  album.trackCount != null
                                                      ? ` · ${album.trackCount} 首`
                                                      : ""
                                              }`
                                            : "专辑"
                                    }
                                    onClick={() => onOpenAlbum(album.id)}
                                    widthClassName="w-full"
                                    className="w-full"
                                />
                            ))}
                        </div>
                        <LoadMoreButton
                            visible={albumHasMore}
                            loading={albumLoadingMore}
                            onClick={() => void loadMoreAlbums()}
                        />
                    </>
                )}
            </Section>
            </div>

            <div ref={songsSection.ref}>
            <Section
                title="新歌速递"
                description="最新上架单曲"
                variant="listen"
                action={
                    <AreaFilter
                        options={SONG_AREAS}
                        value={songType}
                        onChange={setSongType}
                    />
                }
            >
                {songStatus === "idle" || songStatus === "loading" ? (
                    <div className="apple-list-surface space-y-1 p-1.5">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div
                                key={index}
                                className="h-14 animate-pulse rounded-xl bg-[var(--surface-fill)]"
                            />
                        ))}
                    </div>
                ) : songStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="新歌速递加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setSongRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : songs.length === 0 ? (
                    <StateHero variant="empty" title="暂无新歌" />
                ) : (
                    <>
                        <div className="apple-list-surface space-y-0.5 p-1.5">
                            {songs.slice(0, songShown).map((track, index) => (
                                <TrackRow
                                    key={track.id}
                                    track={track}
                                    index={index}
                                    isActive={currentTrack?.id === track.id}
                                    isPlaying={
                                        currentTrack?.id === track.id &&
                                        isPlaying
                                    }
                                    showSource={false}
                                    showAlbumColumn
                                    onPlay={(item) =>
                                        playOrToggle(item, songs)
                                    }
                                />
                            ))}
                        </div>
                        <LoadMoreButton
                            visible={songShown < songs.length}
                            loading={false}
                            onClick={() => setSongShown((n) => n + PAGE_SIZE)}
                        />
                    </>
                )}
            </Section>
            </div>

            <div ref={catSection.ref}>
            <Section
                title="分类歌单"
                description="网友精选碟"
                variant="listen"
                action={
                    <AreaFilter
                        options={PLAYLIST_CATS.map((cat) => ({
                            value: cat,
                            label: cat,
                        }))}
                        value={playlistCat}
                        onChange={setPlaylistCat}
                    />
                }
            >
                {catStatus === "idle" || catStatus === "loading" ? (
                    <PlaylistGridSkeleton
                        count={Math.min(skeletonCount, 5)}
                        style={gridStyle}
                    />
                ) : catStatus === "error" ? (
                    <StateHero
                        variant="error"
                        title="分类歌单加载失败"
                        description="请检查网络或 API 设置后重试"
                        action={
                            <HeroRetryButton
                                onClick={() => setCatRetry((n) => n + 1)}
                            />
                        }
                    />
                ) : catPlaylists.length === 0 ? (
                    <StateHero variant="empty" title="暂无歌单" />
                ) : (
                    <>
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {catPlaylists.map((playlist) => (
                                <MediaCard
                                    key={playlist.id}
                                    coverUrl={playlist.coverUrl}
                                    title={playlist.title}
                                    subtitle={
                                        playlist.trackCount != null
                                            ? `${playlist.trackCount} 首`
                                            : "歌单"
                                    }
                                    onClick={() => onOpenPlaylist(playlist.id)}
                                    widthClassName="w-full"
                                    className="w-full"
                                />
                            ))}
                        </div>
                        <LoadMoreButton
                            visible={catHasMore}
                            loading={catLoadingMore}
                            onClick={() => void loadMoreCat()}
                        />
                    </>
                )}
            </Section>
            </div>
        </div>
    )
}

export { DiscoverPage }
