import { useEffect, useState } from "react"

import { Cover } from "@/components/music/cover"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { addTrackToPlaylist } from "@/lib/netease/track-actions"
import { fetchUserPlaylists } from "@/lib/netease/user"
import { fetchPlaylistHead } from "@/lib/netease/playlist"
import { addLocalTracksToPlaylist } from "@/lib/local/local-playlist"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { Playlist, Track } from "@/lib/types"

type AddToPlaylistDialogProps = {
    track: Track | null
    /** 批量加入时传曲目数组，优先级高于单曲 track */
    tracks?: Track[]
    open: boolean
    onOpenChange: (open: boolean) => void
}

function AddToPlaylistDialog({
    track,
    tracks,
    open,
    onOpenChange,
}: AddToPlaylistDialogProps) {
    const { ready, loggedIn, profile } = useNeteaseSession()
    const items =
        tracks && tracks.length > 0 ? tracks : track ? [track] : []
    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle")
    const [busyId, setBusyId] = useState<string | null>(null)

    useEffect(() => {
        if (!open || !ready || !loggedIn || !profile) {
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
            .catch(() => {
                if (cancelled) {
                    return
                }
                setPlaylists([])
                setStatus("ready")
            })
        return () => {
            cancelled = true
        }
    }, [open, ready, loggedIn, profile])

    async function handleAdd(playlist: Playlist) {
        if (items.length === 0 || busyId) {
            return
        }
        setBusyId(playlist.id)
        try {
            // 本地与网易云曲目分开投递：本地写本地 DB，网易云走网易云接口
            const localIds = items
                .filter((item) => item.source === "local")
                .map((item) => item.id)
            const neteaseIds = items
                .filter((item) => item.source !== "local")
                .map((item) => item.id)
            if (localIds.length > 0) {
                // 取目标歌单当前的排头云端曲目做锚点，本地条目按添加时间插队而非永远置顶
                let anchorTrackId: string | null = null
                try {
                    const head = await fetchPlaylistHead(playlist.id)
                    anchorTrackId = head.firstTrackId
                } catch {
                    anchorTrackId = null
                }
                await addLocalTracksToPlaylist(
                    playlist.id,
                    localIds,
                    anchorTrackId,
                )
            }
            if (neteaseIds.length > 0) {
                await addTrackToPlaylist(playlist.id, neteaseIds)
            }
            notifySuccess("已添加到歌单", {
                description: `${playlist.title} · ${items.length} 首`,
            })
            onOpenChange(false)
        } catch (error) {
            notifyError("添加失败", {
                description:
                    error instanceof Error ? error.message : "请重试",
            })
        } finally {
            setBusyId(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>添加到歌单</DialogTitle>
                    <DialogDescription>选择目标歌单</DialogDescription>
                </DialogHeader>
                <div className="max-h-80 overflow-y-auto px-1 py-2">
                    {status === "loading" ? (
                        <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                            加载歌单…
                        </p>
                    ) : playlists.length === 0 ? (
                        <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                            暂无歌单
                        </p>
                    ) : (
                        <div className="space-y-0.5">
                            {playlists.map((playlist) => (
                                <button
                                    key={playlist.id}
                                    type="button"
                                    disabled={busyId === playlist.id}
                                    onClick={() => void handleAdd(playlist)}
                                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-fill)] disabled:opacity-50"
                                >
                                    <Cover
                                        src={playlist.coverUrl}
                                        alt={playlist.title}
                                        size="sm"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-medium">
                                            {playlist.title}
                                        </p>
                                        {playlist.trackCount != null ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                {playlist.trackCount} 首
                                            </p>
                                        ) : null}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

export { AddToPlaylistDialog }
