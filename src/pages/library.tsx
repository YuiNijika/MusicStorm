import { Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Cover } from "@/components/music/cover"
import { DragList } from "@/components/music/drag-list"
import { PlaylistGridSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { ViewModeToggle } from "@/components/music/view-mode-toggle"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    setPlaylistSort,
    setPlaylistView,
} from "@/lib/library/layout-prefs"
import {
    PLAYLIST_SORT_OPTIONS,
    sortPlaylists,
} from "@/lib/library/sort"
import {
    ORDER_EVENT,
    getPlaylistListOrder,
    setPlaylistListOrder,
} from "@/lib/library/track-order"
import {
    fetchArtistSublist,
    type SimiArtistCard,
} from "@/lib/netease/artist"
import {
    deleteCloudTrack,
    fetchCloudTracks,
} from "@/lib/netease/cloud"
import { fetchMvSublist, type MvCard } from "@/lib/netease/mv"
import { createPlaylist } from "@/lib/netease/playlist"
import { fetchUserPlaylists } from "@/lib/netease/user"
import { notifyError, notifyFromError, notifySuccess } from "@/lib/notify"
import type { Playlist, Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type LibraryTab = "playlists" | "artists" | "mvs" | "cloud"

const LIBRARY_TABS: Array<{ id: LibraryTab; label: string }> = [
    { id: "playlists", label: "歌单" },
    { id: "artists", label: "收藏歌手" },
    { id: "mvs", label: "收藏 MV" },
    { id: "cloud", label: "云盘" },
]

// 网易云 301/未登录/系统错误等登录态失效错误：提示补「可尝试重新登录」
function describeLoadError(error: unknown): string {
    const base =
        error instanceof Error ? error.message : "请检查网络与 API 后重试"
    const isAuthError = /code\D*(301|302)\b|未登录|需要登录|系统错误/i.test(base)
    return isAuthError ? `${base}，可尝试重新登录` : base
}

function LibraryPage() {
    const { openPlaylist, openArtist, openMv } = useMusicNavigation()
    const { ready, loggedIn, profile } = useNeteaseSession()
    const { likedSongPlaylistId } = useLiked()
    const { playlistView, playlistSort } = useLibraryLayout()
    const { count: skeletonCount, gridClass, gridStyle, gridRef } =
        usePlaylistGrid()
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()

    const [tab, setTab] = useState<LibraryTab>("playlists")

    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
        "idle",
    )
    const [retry, setRetry] = useState(0)
    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState("")
    const [createDesc, setCreateDesc] = useState("")
    const [createBusy, setCreateBusy] = useState(false)

    const [artists, setArtists] = useState<SimiArtistCard[]>([])
    const [artistStatus, setArtistStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [artistRetry, setArtistRetry] = useState(0)

    const [mvs, setMvs] = useState<MvCard[]>([])
    const [mvStatus, setMvStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [mvRetry, setMvRetry] = useState(0)

    const [cloud, setCloud] = useState<Track[]>([])
    const [cloudStatus, setCloudStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle")
    const [cloudRetry, setCloudRetry] = useState(0)
    const [cloudDeleteTarget, setCloudDeleteTarget] = useState<Track | null>(
        null,
    )
    const [cloudDeleteBusy, setCloudDeleteBusy] = useState(false)

    async function handleCreatePlaylist() {
        const name = createName.trim()
        if (!name || createBusy || !profile) {
            return
        }
        setCreateBusy(true)
        try {
            const id = await createPlaylist(name, createDesc.trim() || undefined)
            notifySuccess("歌单已创建", { description: name })
            setCreateOpen(false)
            setCreateName("")
            setCreateDesc("")
            // 刷新列表并跳转到新歌单
            const items = await fetchUserPlaylists(profile.userId)
            setPlaylists(items)
            setStatus("ready")
            openPlaylist(id)
        } catch (error) {
            notifyFromError("创建歌单失败", error)
        } finally {
            setCreateBusy(false)
        }
    }

    const [orderTick, setOrderTick] = useState(0)

    useEffect(() => {
        function onOrder() {
            setOrderTick((n) => n + 1)
        }
        window.addEventListener(ORDER_EVENT, onOrder)
        return () => window.removeEventListener(ORDER_EVENT, onOrder)
    }, [])

    const sortedPlaylists = useMemo(
        () => sortPlaylists(playlists, playlistSort, getPlaylistListOrder()),
        [playlists, playlistSort, orderTick],
    )

    useEffect(() => {
        if (!ready) {
            return
        }
        if (!loggedIn || !profile) {
            setPlaylists([])
            setStatus("idle")
            return
        }

        let cancelled = false
        setStatus("loading")
        void fetchUserPlaylists(profile.userId)
            .then((items) => {
                if (cancelled) {
                    return
                }
                setPlaylists(items)
                setStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setPlaylists([])
                setStatus("error")
                notifyError("歌单加载失败", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "请检查网络与 API 后重试",
                })
            })
        return () => {
            cancelled = true
        }
    }, [ready, loggedIn, profile, retry])

    useEffect(() => {
        if (!ready || !loggedIn || !profile || tab !== "artists") {
            return
        }
        let cancelled = false
        setArtistStatus("loading")
        void fetchArtistSublist()
            .then((items) => {
                if (cancelled) {
                    return
                }
                setArtists(items)
                setArtistStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setArtists([])
                setArtistStatus("error")
                notifyError("收藏歌手加载失败", {
                    description: describeLoadError(error),
                })
            })
        return () => {
            cancelled = true
        }
    }, [ready, loggedIn, profile, tab, artistRetry])

    useEffect(() => {
        if (!ready || !loggedIn || !profile || tab !== "mvs") {
            return
        }
        let cancelled = false
        setMvStatus("loading")
        void fetchMvSublist()
            .then((items) => {
                if (cancelled) {
                    return
                }
                setMvs(items)
                setMvStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setMvs([])
                setMvStatus("error")
                notifyError("收藏 MV 加载失败", {
                    description: describeLoadError(error),
                })
            })
        return () => {
            cancelled = true
        }
    }, [ready, loggedIn, profile, tab, mvRetry])

    useEffect(() => {
        if (!ready || !loggedIn || !profile || tab !== "cloud") {
            return
        }
        let cancelled = false
        setCloudStatus("loading")
        void fetchCloudTracks()
            .then((items) => {
                if (cancelled) {
                    return
                }
                setCloud(items)
                setCloudStatus("ready")
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setCloud([])
                setCloudStatus("error")
                notifyError("云盘加载失败", {
                    description: describeLoadError(error),
                })
            })
        return () => {
            cancelled = true
        }
    }, [ready, loggedIn, profile, tab, cloudRetry])

    async function handleDeleteCloud() {
        if (!cloudDeleteTarget || cloudDeleteBusy) {
            return
        }
        setCloudDeleteBusy(true)
        try {
            await deleteCloudTrack(cloudDeleteTarget.id)
            setCloud((prev) =>
                prev.filter((item) => item.id !== cloudDeleteTarget.id),
            )
            notifySuccess("已从云盘删除")
            setCloudDeleteTarget(null)
        } catch (error) {
            notifyFromError("删除失败", error)
        } finally {
            setCloudDeleteBusy(false)
        }
    }

    return (
        <div className="space-y-6">
            <PageTitle
                title="资料库"
                subtitle={loggedIn ? "网易云歌单与收藏" : "来自网易云"}
            />

            <div className="flex flex-wrap items-center gap-1.5">
                {LIBRARY_TABS.map((item) => {
                    const active = tab === item.id
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={cn(
                                "inline-flex h-8 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-medium transition-colors",
                                active
                                    ? "bg-foreground text-background"
                                    : "bg-[var(--surface-fill)] text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                            )}
                        >
                            {item.label}
                        </button>
                    )
                })}
            </div>

            {tab === "playlists" ? (
            <Section
                title="我的歌单"
                description={
                    !ready
                        ? "正在同步账号…"
                        : !loggedIn
                          ? "来自网易云"
                          : status === "ready"
                            ? `${sortedPlaylists.length} 个歌单`
                            : "来自网易云账号"
                }
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        {loggedIn ? (
                            <button
                                type="button"
                                disabled={createBusy}
                                onClick={() => setCreateOpen(true)}
                                className="apple-primary-action inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:opacity-60"
                            >
                                <Plus className="size-3.5" strokeWidth={2.4} />
                                新建歌单
                            </button>
                        ) : null}
                        <SortSelect
                            value={playlistSort}
                            options={PLAYLIST_SORT_OPTIONS}
                            onChange={setPlaylistSort}
                            label="歌单排序"
                        />
                        <ViewModeToggle
                            value={playlistView}
                            onChange={setPlaylistView}
                            label="歌单展示"
                        />
                    </div>
                }
            >
                {!ready || status === "loading" ? (
                    playlistView === "card" ? (
                        <PlaylistGridSkeleton
                            count={skeletonCount}
                            style={gridStyle}
                            gridRef={gridRef}
                        />
                    ) : (
                        <div className="apple-list-surface space-y-1 p-1.5">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="h-14 animate-pulse rounded-xl bg-[var(--surface-fill)]"
                                />
                            ))}
                        </div>
                    )
                ) : !loggedIn ? (
                    <StateHero
                        variant="auth"
                        title="登录后同步歌单"
                        description="在侧栏头像菜单或设置中登录网易云"
                    />
                ) : status === "error" ? (
                    <StateHero
                        variant="error"
                        title="歌单加载失败"
                        description="请检查网络与 API 后重试"
                        action={
                            <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                        }
                    />
                ) : playlists.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="暂无歌单"
                        description="在网易云创建或收藏歌单后会出现在这里"
                    />
                ) : playlistView === "list" ? (
                    <DragList
                        items={sortedPlaylists}
                        enabled={playlistSort === "custom"}
                        className="apple-list-surface space-y-0.5 p-1.5"
                        onReorder={(next) =>
                            setPlaylistListOrder(next.map((item) => item.id))
                        }
                        renderItem={(playlist, _index, handle) => {
                            const isLikedFolder =
                                playlist.id === likedSongPlaylistId
                            return (
                                <button
                                    type="button"
                                    onClick={() => openPlaylist(playlist.id)}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors",
                                        "hover:bg-[var(--surface-fill)] active:scale-[0.995]",
                                        isLikedFolder &&
                                            "bg-primary/[0.06] ring-1 ring-primary/20 dark:bg-primary/[0.12]",
                                    )}
                                >
                                    {handle}
                                    <Cover
                                        src={playlist.coverUrl}
                                        alt={playlist.title}
                                        size="sm"
                                        className="size-12 rounded-xl"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-medium tracking-[-0.01em]">
                                            {playlist.title}
                                        </p>
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {isLikedFolder
                                                ? "我喜欢的音乐"
                                                : playlist.trackCount
                                                  ? `${playlist.trackCount} 首`
                                                  : playlist.description || "歌单"}
                                        </p>
                                    </div>
                                </button>
                            )
                        }}
                    />
                ) : (
                    <div ref={gridRef} className={gridClass} style={gridStyle}>
                        {sortedPlaylists.map((playlist) => {
                            const isLikedFolder =
                                playlist.id === likedSongPlaylistId
                            return (
                                <MediaCard
                                    key={playlist.id}
                                    coverUrl={playlist.coverUrl}
                                    title={playlist.title}
                                    subtitle={
                                        isLikedFolder
                                            ? "我喜欢的音乐"
                                            : playlist.trackCount
                                              ? `${playlist.trackCount} 首`
                                              : playlist.description || "歌单"
                                    }
                                    onClick={() => openPlaylist(playlist.id)}
                                    active={isLikedFolder}
                                    widthClassName="w-full"
                                    className="w-full"
                                />
                            )
                        })}
                    </div>
                )}
            </Section>
            ) : tab === "artists" ? (
                <Section title="收藏歌手" description="关注过的歌手" variant="listen">
                    {artistStatus === "loading" ? (
                        <PlaylistGridSkeleton
                            count={Math.min(skeletonCount, 5)}
                            style={gridStyle}
                        />
                    ) : artistStatus === "error" ? (
                        <StateHero
                            variant="error"
                            title="收藏歌手加载失败"
                            description="请检查网络与 API 后重试"
                            action={
                                <HeroRetryButton
                                    onClick={() => setArtistRetry((n) => n + 1)}
                                />
                            }
                        />
                    ) : artists.length === 0 ? (
                        <StateHero
                            variant="empty"
                            title="暂无收藏歌手"
                            description="在歌手页点收藏后会出现在这里"
                        />
                    ) : (
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {artists.map((artist) => (
                                <MediaCard
                                    key={artist.id}
                                    coverUrl={artist.coverUrl}
                                    title={artist.name}
                                    subtitle={
                                        artist.albumCount != null
                                            ? `${artist.albumCount} 张专辑`
                                            : "歌手"
                                    }
                                    onClick={() => openArtist(artist.id)}
                                    widthClassName="w-full"
                                    className="w-full"
                                />
                            ))}
                        </div>
                    )}
                </Section>
            ) : tab === "mvs" ? (
                <Section title="收藏 MV" description="收藏过的视频" variant="listen">
                    {mvStatus === "loading" ? (
                        <PlaylistGridSkeleton
                            count={Math.min(skeletonCount, 5)}
                            style={gridStyle}
                        />
                    ) : mvStatus === "error" ? (
                        <StateHero
                            variant="error"
                            title="收藏 MV 加载失败"
                            description="请检查网络与 API 后重试"
                            action={
                                <HeroRetryButton
                                    onClick={() => setMvRetry((n) => n + 1)}
                                />
                            }
                        />
                    ) : mvs.length === 0 ? (
                        <StateHero
                            variant="empty"
                            title="暂无收藏 MV"
                            description="在 MV 页点收藏后会出现在这里"
                        />
                    ) : (
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {mvs.map((mv) => (
                                <MediaCard
                                    key={mv.id}
                                    coverUrl={mv.coverUrl}
                                    title={mv.title}
                                    subtitle={mv.artistName || "MV"}
                                    onClick={() => openMv(mv.id)}
                                    widthClassName="w-full"
                                    className="w-full"
                                />
                            ))}
                        </div>
                    )}
                </Section>
            ) : tab === "cloud" ? (
                <Section title="云盘" description="网易云音乐云盘" variant="listen">
                    {cloudStatus === "loading" ? (
                        <div className="apple-list-surface space-y-1 p-1.5">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="h-14 animate-pulse rounded-xl bg-[var(--surface-fill)]"
                                />
                            ))}
                        </div>
                    ) : cloudStatus === "error" ? (
                        <StateHero
                            variant="error"
                            title="云盘加载失败"
                            description="请检查网络与 API 后重试"
                            action={
                                <HeroRetryButton
                                    onClick={() => setCloudRetry((n) => n + 1)}
                                />
                            }
                        />
                    ) : cloud.length === 0 ? (
                        <StateHero
                            variant="empty"
                            title="云盘为空"
                            description="在网易云上传的歌曲会同步到这里"
                        />
                    ) : (
                        <div className="apple-list-surface space-y-0.5 p-1.5">
                            {cloud.map((track, index) => (
                                <TrackRow
                                    key={track.id}
                                    track={track}
                                    index={index}
                                    isActive={currentTrack?.id === track.id}
                                    isPlaying={
                                        currentTrack?.id === track.id && isPlaying
                                    }
                                    showSource={false}
                                    showAlbumColumn
                                    onCloudDelete={() => setCloudDeleteTarget(track)}
                                    onPlay={(item) => playOrToggle(item, cloud)}
                                />
                            ))}
                        </div>
                    )}
                </Section>
            ) : null}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>新建歌单</DialogTitle>
                        <DialogDescription>输入歌单名称与介绍</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 px-1 py-2">
                        <Input
                            value={createName}
                            onChange={(event) =>
                                setCreateName(event.currentTarget.value)
                            }
                            placeholder="歌单名称"
                            className="h-10 rounded-xl"
                        />
                        <Textarea
                            value={createDesc}
                            onChange={(event) =>
                                setCreateDesc(event.currentTarget.value)
                            }
                            placeholder="歌单介绍（可选）"
                            rows={3}
                            className="rounded-xl resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setCreateOpen(false)}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            disabled={createBusy}
                            onClick={() => void handleCreatePlaylist()}
                            className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                        >
                            {createBusy ? "创建中…" : "创建"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={cloudDeleteTarget != null}
                onOpenChange={(open) => {
                    if (!open) {
                        setCloudDeleteTarget(null)
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>从云盘删除</DialogTitle>
                        <DialogDescription>
                            将删除「{cloudDeleteTarget?.title}」，此操作不可撤销
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setCloudDeleteTarget(null)}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            disabled={cloudDeleteBusy}
                            onClick={() => void handleDeleteCloud()}
                            className="h-9 cursor-pointer rounded-full bg-destructive/10 px-4 text-[13px] font-medium text-destructive transition-[background-color,transform] hover:bg-destructive/20 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                        >
                            {cloudDeleteBusy ? "删除中…" : "删除"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export { LibraryPage }