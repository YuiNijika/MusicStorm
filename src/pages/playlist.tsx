import { Heart, Library, Pencil, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { ViewModeToggle } from "@/components/music/view-mode-toggle"
import { AddToPlaylistDialog } from "@/components/music/add-to-playlist-dialog"
import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { DragList } from "@/components/music/drag-list"
import { PlaylistDetailSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { SourceBadge } from "@/components/music/source-badge"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
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
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    setPlaylistTracksView,
    setTrackSort,
} from "@/lib/library/layout-prefs"
import { sortTracks, TRACK_SORT_OPTIONS } from "@/lib/library/sort"
import {
    ORDER_EVENT,
    getPlaylistTrackOrder,
    setPlaylistTrackOrder,
} from "@/lib/library/track-order"
import { resolveTrackCoverUrl } from "@/lib/music/cover-overrides"
import { fetchIntelligencePlaylist } from "@/lib/netease/fm"
import {
    deletePlaylist,
    fetchPlaylistDetail,
    updatePlaylistDesc,
    updatePlaylistName,
} from "@/lib/netease/playlist"
import { formatError, notifyFromError, notifySuccess } from "@/lib/notify"
import type { Playlist, Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type PlaylistPageProps = {
    playlistId: string
    onBack: () => void
}

function PlaylistPage({ playlistId, onBack }: PlaylistPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { loggedIn, profile } = useNeteaseSession()
    const { playlistTracksView, trackSort } = useLibraryLayout()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()
    const {
        likedSongPlaylistId,
        isPlaylistSubscribed,
        togglePlaylistSubscribed,
    } = useLiked()
    const [playlist, setPlaylist] = useState<Playlist | null>(null)
    const [tracks, setTracks] = useState<Track[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorText, setErrorText] = useState<string | null>(null)
    const [subBusy, setSubBusy] = useState(false)
    const [retry, setRetry] = useState(0)
    const [orderTick, setOrderTick] = useState(0)
    const [editOpen, setEditOpen] = useState(false)
    const [editName, setEditName] = useState("")
    const [editDesc, setEditDesc] = useState("")
    const [editBusy, setEditBusy] = useState(false)
    const [intelBusy, setIntelBusy] = useState(false)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(
        null,
    )

    const isOwnLiked = playlistId === likedSongPlaylistId
    const isOwnPlaylist =
        playlist?.creator?.id != null &&
        profile != null &&
        playlist.creator.id === String(profile.userId)
    const subscribed = isPlaylistSubscribed(playlistId) || isOwnLiked
    const customOrder = useMemo(() => {
        void orderTick
        return getPlaylistTrackOrder(playlistId)
    }, [playlistId, orderTick])

    const sortedTracks = useMemo(
        () => sortTracks(tracks, trackSort, customOrder),
        [tracks, trackSort, customOrder],
    )

    const dragEnabled =
        trackSort === "custom" && playlistTracksView === "list"

    useEffect(() => {
        function onOrder() {
            setOrderTick((n) => n + 1)
        }
        window.addEventListener(ORDER_EVENT, onOrder)
        return () => window.removeEventListener(ORDER_EVENT, onOrder)
    }, [])

    useEffect(() => {
        let cancelled = false
        setIsLoading(true)
        setErrorText(null)

        void fetchPlaylistDetail(playlistId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setPlaylist(result.playlist)
                setTracks(result.tracks)
                setIsLoading(false)
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setPlaylist(null)
                setTracks([])
                setIsLoading(false)
                const message =
                    formatError(error) || "歌单加载失败，请确认网易云接口可用"
                setErrorText(message)
                notifyFromError("歌单加载失败", error)
            })

        return () => {
            cancelled = true
        }
    }, [playlistId, retry])

    async function handleToggleSubscribe() {
        if (!loggedIn || isOwnLiked || subBusy) {
            return
        }
        setSubBusy(true)
        try {
            await togglePlaylistSubscribed(playlistId)
        } catch {
            // 乐观回滚已在 store
        } finally {
            setSubBusy(false)
        }
    }

    // 心动模式：随机取一首做种子，生成智能推荐队列并接管播放
    async function handleIntelligence() {
        if (sortedTracks.length === 0 || intelBusy) {
            return
        }
        setIntelBusy(true)
        try {
            const seed =
                sortedTracks[Math.floor(Math.random() * sortedTracks.length)]
            if (!seed) {
                return
            }
            const tracks = await fetchIntelligencePlaylist(seed.id, playlistId)
            if (tracks.length === 0) {
                notifySuccess("心动模式暂无可播歌曲", {
                    description: "稍后再试试",
                })
                return
            }
            playTrack(tracks[0]!, tracks)
        } catch (error) {
            notifyFromError("心动模式失败", error)
        } finally {
            setIntelBusy(false)
        }
    }

    function openEditDialog() {
        setEditName(playlist?.title ?? "")
        setEditDesc(playlist?.description ?? "")
        setEditOpen(true)
    }

    async function handleDelete() {
        if (deleteBusy || !playlist) {
            return
        }
        setDeleteBusy(true)
        try {
            await deletePlaylist(playlistId)
            notifySuccess("歌单已删除")
            onBack()
        } catch (error) {
            notifyFromError("删除歌单失败", error)
        } finally {
            setDeleteBusy(false)
        }
    }

    async function handleSubmitEdit() {
        if (editBusy || !playlist) {
            return
        }
        const name = editName.trim()
        const desc = editDesc.trim()
        if (!name) {
            setEditOpen(false)
            return
        }
        const nameChanged = name !== playlist.title
        const descChanged = desc !== (playlist.description ?? "")
        if (!nameChanged && !descChanged) {
            setEditOpen(false)
            return
        }
        setEditBusy(true)
        try {
            if (nameChanged) {
                await updatePlaylistName(playlistId, name)
            }
            if (descChanged) {
                await updatePlaylistDesc(playlistId, desc)
            }
            setPlaylist((prev) =>
                prev
                    ? {
                          ...prev,
                          title: nameChanged ? name : prev.title,
                          description: descChanged ? desc : prev.description,
                      }
                    : prev,
            )
            notifySuccess("歌单已保存", { description: name })
            setEditOpen(false)
        } catch (error) {
            notifyFromError("保存失败", error)
        } finally {
            setEditBusy(false)
        }
    }

    function handleReorder(next: Track[]) {
        setPlaylistTrackOrder(
            playlistId,
            next.map((item) => item.id),
        )
    }

    return (
        <div className="space-y-6">
            <BackButton onClick={onBack} />

            {isLoading ? (
                <PlaylistDetailSkeleton />
            ) : errorText ? (
                <StateHero
                    variant="error"
                    title="歌单加载失败"
                    description={errorText}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : playlist ? (
                <>
                    <header className="flex flex-wrap items-end gap-5">
                        <Cover
                            src={playlist.coverUrl}
                            alt={playlist.title}
                            size="lg"
                            className="size-36 rounded-[24px]"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <SourceBadge source={playlist.source} />
                                <span className="text-[12px] text-muted-foreground">
                                    {playlist.trackCount ?? sortedTracks.length} 首
                                </span>
                                {playlist.creator ? (
                                    <span className="text-[12px] text-muted-foreground">
                                        创建者 · {playlist.creator.name || "未知"}
                                    </span>
                                ) : null}
                            </div>
                            <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.04em] md:font-semibold">
                                {playlist.title}
                            </h1>
                            {playlist.description ? (
                                <p className="line-clamp-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                                    {playlist.description}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                {sortedTracks[0] ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const first = sortedTracks[0]
                                            if (first) {
                                                playTrack(first, sortedTracks)
                                            }
                                        }}
                                        className="h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
                                    >
                                        播放全部
                                    </button>
                                ) : null}
                                {sortedTracks.length > 0 ? (
                                    <button
                                        type="button"
                                        disabled={intelBusy}
                                        onClick={() => void handleIntelligence()}
                                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                                    >
                                        <Sparkles className="size-3.5" />
                                        心动模式
                                    </button>
                                ) : null}
                                {isOwnPlaylist ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={openEditDialog}
                                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                                        >
                                            <Pencil className="size-3.5" />
                                            编辑
                                        </button>
                                        <button
                                            type="button"
                                            disabled={deleteBusy}
                                            onClick={() => setDeleteOpen(true)}
                                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-destructive transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                                        >
                                            <Trash2 className="size-3.5" />
                                            删除
                                        </button>
                                    </>
                                ) : loggedIn && !isOwnLiked ? (
                                    <button
                                        type="button"
                                        disabled={subBusy}
                                        onClick={() => void handleToggleSubscribe()}
                                        className={cn(
                                            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50",
                                            subscribed
                                                ? "bg-primary/15 text-primary"
                                                : "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
                                        )}
                                    >
                                        <Heart
                                            className={cn(
                                                "size-3.5",
                                                subscribed && "fill-current",
                                            )}
                                        />
                                        {subscribed ? "已收藏" : "收藏歌单"}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </header>

                    <Section
                        title="歌曲"
                        description={`${sortedTracks.length} 首${
                            dragEnabled ? " · 拖动手柄排序" : ""
                        }`}
                        action={
                            <div className="flex flex-wrap items-center gap-2">
                                <SortSelect
                                    value={trackSort}
                                    options={TRACK_SORT_OPTIONS}
                                    onChange={setTrackSort}
                                    label="歌曲排序"
                                />
                                <ViewModeToggle
                                    value={playlistTracksView}
                                    onChange={setPlaylistTracksView}
                                    label="歌曲展示"
                                />
                            </div>
                        }
                    >
                        {sortedTracks.length === 0 ? (
                            <StateHero variant="empty" title="暂无歌曲" />
                        ) : playlistTracksView === "card" ? (
                            <div ref={gridRef} className={gridClass} style={gridStyle}>
                                {sortedTracks.map((track) => (
                                    <MediaCard
                                        key={track.id}
                                        coverUrl={resolveTrackCoverUrl(
                                            track.id,
                                            track.coverUrl,
                                        )}
                                        title={track.title}
                                        subtitle={track.artist}
                                        widthClassName="w-full"
                                        active={currentTrack?.id === track.id}
                                        onClick={() =>
                                            playOrToggle(track, sortedTracks)
                                        }
                                        overlay={
                                            track.source === "netease" ? (
                                                <div
                                                    role="button"
                                                    title="添加到歌单"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        setAddToPlaylistTrack(
                                                            track,
                                                        )
                                                    }}
                                                    className="absolute bottom-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 group-hover:opacity-100"
                                                >
                                                    <Library className="size-4" />
                                                </div>
                                            ) : null
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="apple-list-surface p-1.5">
                                {dragEnabled ? (
                                    <DragList
                                        items={sortedTracks}
                                        enabled
                                        onReorder={handleReorder}
                                        renderItem={(track, index, handle) => (
                                            <TrackRow
                                                track={track}
                                                index={index}
                                                leading={handle}
                                                isActive={currentTrack?.id === track.id}
                                                isPlaying={
                                                    currentTrack?.id === track.id &&
                                                    isPlaying
                                                }
                                                showSource={false}
                                                playlistId={
                                                    isOwnLiked ? undefined : playlistId
                                                }
                                                onRemoved={(id) =>
                                                    setTracks((prev) =>
                                                        prev.filter(
                                                            (item) => item.id !== id,
                                                        ),
                                                    )
                                                }
                                                onPlay={(item) =>
                                                    playOrToggle(item, sortedTracks)
                                                }
                                            />
                                        )}
                                    />
                                ) : (
                                    <VirtualList
                                        items={sortedTracks}
                                        itemHeight={58}
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
                                                playlistId={
                                                    isOwnLiked ? undefined : playlistId
                                                }
                                                onRemoved={(id) =>
                                                    setTracks((prev) =>
                                                        prev.filter(
                                                            (item) => item.id !== id,
                                                        ),
                                                    )
                                                }
                                                onPlay={(item) =>
                                                    playOrToggle(item, sortedTracks)
                                                }
                                            />
                                        )}
                                    />
                                )}
                            </div>
                        )}
                    </Section>
                </>
            ) : null}

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>编辑歌单</DialogTitle>
                        <DialogDescription>修改歌单名称与介绍</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 px-1 py-2">
                        <Input
                            value={editName}
                            onChange={(event) =>
                                setEditName(event.currentTarget.value)
                            }
                            placeholder="歌单名称"
                            className="h-10 rounded-xl"
                        />
                        <Textarea
                            value={editDesc}
                            onChange={(event) =>
                                setEditDesc(event.currentTarget.value)
                            }
                            placeholder="歌单介绍"
                            rows={3}
                            className="rounded-xl resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setEditOpen(false)}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            disabled={editBusy}
                            onClick={() => void handleSubmitEdit()}
                            className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                        >
                            {editBusy ? "保存中…" : "保存"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>删除歌单</DialogTitle>
                        <DialogDescription>
                            将删除「{playlist?.title}」，此操作不可撤销
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setDeleteOpen(false)}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            disabled={deleteBusy}
                            onClick={() => void handleDelete()}
                            className="h-9 cursor-pointer rounded-full bg-destructive/10 px-4 text-[13px] font-medium text-destructive transition-[background-color,transform] hover:bg-destructive/20 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                        >
                            {deleteBusy ? "删除中…" : "删除"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AddToPlaylistDialog
                track={addToPlaylistTrack}
                open={addToPlaylistTrack !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setAddToPlaylistTrack(null)
                    }
                }}
            />
        </div>
    )
}

export { PlaylistPage }