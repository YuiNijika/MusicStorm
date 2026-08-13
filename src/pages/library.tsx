import { Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Cover } from "@/components/music/cover"
import { PlaylistGridSkeleton } from "@/components/music/loading-skeletons"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
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
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    setPlaylistSort,
    setPlaylistView,
} from "@/lib/library/layout-prefs"
import {
    PLAYLIST_SORT_OPTIONS,
    sortPlaylists,
} from "@/lib/library/sort"
import { createPlaylist } from "@/lib/netease/playlist"
import { fetchUserPlaylists } from "@/lib/netease/user"
import { notifyError, notifyFromError, notifySuccess } from "@/lib/notify"
import type { Playlist } from "@/lib/types"
import { cn } from "@/lib/utils"

function LibraryPage() {
    const { openPlaylist } = useMusicNavigation()
    const { ready, loggedIn, profile } = useNeteaseSession()
    const { likedSongPlaylistId } = useLiked()
    const { playlistView, playlistSort } = useLibraryLayout()
    const { count: skeletonCount, gridClass, gridStyle, gridRef } =
        usePlaylistGrid()

    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
        "idle",
    )
    const [retry, setRetry] = useState(0)
    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState("")
    const [createBusy, setCreateBusy] = useState(false)

    async function handleCreatePlaylist() {
        const name = createName.trim()
        if (!name || createBusy || !profile) {
            return
        }
        setCreateBusy(true)
        try {
            const id = await createPlaylist(name)
            notifySuccess("歌单已创建", { description: name })
            setCreateOpen(false)
            setCreateName("")
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

    const sortedPlaylists = useMemo(
        () => sortPlaylists(playlists, playlistSort),
        [playlists, playlistSort],
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

    return (
        <div className="space-y-6">
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
                    <div className="apple-list-surface space-y-0.5 p-1.5">
                        {sortedPlaylists.map((playlist) => {
                            const isLikedFolder =
                                playlist.id === likedSongPlaylistId
                            return (
                                <button
                                    key={playlist.id}
                                    type="button"
                                    onClick={() => openPlaylist(playlist.id)}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors",
                                        "hover:bg-[var(--surface-fill)] active:scale-[0.995]",
                                        isLikedFolder &&
                                            "bg-primary/[0.06] ring-1 ring-primary/20 dark:bg-primary/[0.12]",
                                    )}
                                >
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
                        })}
                    </div>
                ) : (
                    <div ref={gridRef} className={gridClass} style={gridStyle}>
                        {sortedPlaylists.map((playlist) => {
                            const isLikedFolder =
                                playlist.id === likedSongPlaylistId
                            return (
                                <button
                                    key={playlist.id}
                                    type="button"
                                    onClick={() => openPlaylist(playlist.id)}
                                    className={cn(
                                        "group flex cursor-pointer flex-col gap-3 rounded-[22px] p-3 text-left",
                                        "bg-[var(--surface-fill)] transition-[background-color,transform]",
                                        "hover:bg-[var(--surface-fill-hover)] active:scale-[0.98] active:duration-[var(--duration-press)]",
                                        isLikedFolder &&
                                            "ring-1 ring-primary/25 bg-primary/[0.06] dark:bg-primary/[0.12]",
                                    )}
                                >
                                    <Cover
                                        src={playlist.coverUrl}
                                        alt={playlist.title}
                                        size="xl"
                                        className="transition-transform duration-[var(--duration-hover)] group-hover:scale-[1.02] group-active:scale-[0.98] group-active:duration-[var(--duration-press)]"
                                    />
                                    <div className="min-w-0 px-0.5">
                                        <p className="truncate text-[14px] font-semibold tracking-[-0.02em]">
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
                        })}
                    </div>
                )}
            </Section>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>新建歌单</DialogTitle>
                        <DialogDescription>输入歌单名称</DialogDescription>
                    </DialogHeader>
                    <div className="px-1 py-2">
                        <Input
                            value={createName}
                            onChange={(event) =>
                                setCreateName(event.currentTarget.value)
                            }
                            placeholder="歌单名称"
                            className="h-10 rounded-xl"
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
        </div>
    )
}

export { LibraryPage }