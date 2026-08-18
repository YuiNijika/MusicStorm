import { useEffect, useRef, useState } from "react"

import { Heart } from "lucide-react"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    fetchSongComments,
    fetchSongStats,
    type NeteaseComment,
    type SongStats,
} from "@/lib/netease/comment"
import { cn } from "@/lib/utils"
import type { Track } from "@/lib/types"

type CommentSheetProps = {
    track: Track | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

const PAGE_SIZE = 20

function formatCount(value: number): string {
    if (value >= 100_000_000) {
        return `${(value / 100_000_000).toFixed(1)}亿`
    }
    if (value >= 10_000) {
        return `${(value / 10_000).toFixed(1)}万`
    }
    return String(value)
}

function formatCommentTime(ms: number): string {
    if (!ms) {
        return ""
    }
    const diff = Date.now() - ms
    const minute = 60_000
    const hour = 3_600_000
    const day = 86_400_000
    if (diff < minute) {
        return "刚刚"
    }
    if (diff < hour) {
        return `${Math.floor(diff / minute)} 分钟前`
    }
    if (diff < day) {
        return `${Math.floor(diff / hour)} 小时前`
    }
    if (diff < 30 * day) {
        return `${Math.floor(diff / day)} 天前`
    }
    const date = new Date(ms)
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function CommentItem({ comment, hot = false }: { comment: NeteaseComment; hot?: boolean }) {
    const user = comment.user
    const nickname = user?.nickname?.trim() || "网易云用户"
    const replied = comment.beReplied?.[0]
    const [avatarFailed, setAvatarFailed] = useState(false)

    return (
        <div className="flex gap-3">
            {avatarFailed || !user?.avatarUrl ? (
                <span className="size-9 shrink-0 rounded-full bg-[var(--surface-fill)]" />
            ) : (
                <img
                    src={user.avatarUrl}
                    alt={nickname}
                    loading="lazy"
                    onError={() => setAvatarFailed(true)}
                    className="size-9 shrink-0 rounded-full object-cover"
                />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "truncate text-[12px] font-medium",
                            hot ? "text-primary" : "text-foreground",
                        )}
                    >
                        {nickname}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatCommentTime(comment.time)}
                    </span>
                </div>
                {replied ? (
                    <p className="mt-1 truncate rounded-lg bg-[var(--surface-fill)] px-2.5 py-1 text-[12px] text-muted-foreground">
                        <span className="font-medium">
                            @{replied.user?.nickname?.trim() || "用户"}
                        </span>
                        ：{replied.content}
                    </p>
                ) : null}
                <p className="mt-1 break-words whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                    {comment.content}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {comment.ipLocation?.location ? (
                        <span>{comment.ipLocation.location}</span>
                    ) : null}
                    {comment.likedCount > 0 ? (
                        <span className="flex items-center gap-1">
                            <Heart className="size-3" />
                            {formatCount(comment.likedCount)}
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function CommentSheet({ track, open, onOpenChange }: CommentSheetProps) {
    const [comments, setComments] = useState<NeteaseComment[]>([])
    const [hotComments, setHotComments] = useState<NeteaseComment[]>([])
    const [total, setTotal] = useState(0)
    const [stats, setStats] = useState<SongStats | null>(null)
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const offsetRef = useRef(0)

    const trackId = track?.id
    const isNetease = track?.source === "netease"

    useEffect(() => {
        if (!open || !trackId || !isNetease) {
            return
        }
        let cancelled = false
        setStatus("loading")
        setComments([])
        setHotComments([])
        setTotal(0)
        setStats(null)
        setHasMore(false)
        offsetRef.current = 0

        void Promise.all([
            fetchSongComments(trackId, { limit: PAGE_SIZE, offset: 0 }),
            fetchSongStats(trackId),
        ])
            .then(([data, songStats]) => {
                if (cancelled) {
                    return
                }
                setComments(data.comments)
                setHotComments(data.hotComments)
                setTotal(data.total)
                setHasMore(data.more && data.comments.length > 0)
                setStats(songStats)
                setStatus("ready")
            })
            .catch(() => {
                if (cancelled) {
                    return
                }
                setStatus("error")
            })

        return () => {
            cancelled = true
        }
    }, [open, trackId, isNetease])

    async function loadMore() {
        if (!trackId || loadingMore || !hasMore) {
            return
        }
        setLoadingMore(true)
        try {
            const nextOffset = offsetRef.current + PAGE_SIZE
            const data = await fetchSongComments(trackId, {
                limit: PAGE_SIZE,
                offset: nextOffset,
            })
            offsetRef.current = nextOffset
            setComments((prev) => {
                const seen = new Set(prev.map((item) => item.commentId))
                const merged = data.comments.filter(
                    (item) => !seen.has(item.commentId),
                )
                return [...prev, ...merged]
            })
            setHasMore(data.more && data.comments.length > 0)
        } catch {
            // 加载失败保持现状，用户可再点
        } finally {
            setLoadingMore(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>评论</DialogTitle>
                    <DialogDescription>
                        {track ? `${track.title} · ${track.artist}` : ""}
                    </DialogDescription>
                </DialogHeader>

                <div className="-mx-1 flex items-center gap-3 px-1 text-[12px] text-muted-foreground">
                    {total > 0 ? <span>评论 {formatCount(total)}</span> : null}
                    {stats && stats.likedCount > 0 ? (
                        <span className="flex items-center gap-1">
                            <Heart className="size-3 text-rose-500" />
                            收藏 {formatCount(stats.likedCount)}
                        </span>
                    ) : null}
                </div>

                <div className="max-h-[60vh] overflow-y-auto pr-1">
                    {status === "loading" ? (
                        <p className="px-3 py-10 text-center text-[12px] text-muted-foreground">
                            加载评论…
                        </p>
                    ) : status === "error" ? (
                        <p className="px-3 py-10 text-center text-[12px] text-muted-foreground">
                            评论加载失败
                        </p>
                    ) : comments.length === 0 && hotComments.length === 0 ? (
                        <p className="px-3 py-10 text-center text-[12px] text-muted-foreground">
                            暂无评论
                        </p>
                    ) : (
                        <div className="space-y-5">
                            {hotComments.length > 0 ? (
                                <div>
                                    <p className="mb-3 text-[13px] font-semibold text-foreground">
                                        精彩评论
                                    </p>
                                    <div className="space-y-4">
                                        {hotComments.map((comment) => (
                                            <CommentItem
                                                key={comment.commentId}
                                                comment={comment}
                                                hot
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {comments.length > 0 ? (
                                <div>
                                    {hotComments.length > 0 ? (
                                        <p className="mb-3 text-[13px] font-semibold text-foreground">
                                            最新评论
                                        </p>
                                    ) : null}
                                    <div className="space-y-4">
                                        {comments.map((comment) => (
                                            <CommentItem
                                                key={comment.commentId}
                                                comment={comment}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                {hasMore ? (
                    <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => void loadMore()}
                        className="h-9 w-full cursor-pointer rounded-full bg-[var(--surface-fill)] text-[12px] font-medium text-foreground transition-colors hover:bg-[var(--surface-fill-hover)] disabled:opacity-50"
                    >
                        {loadingMore ? "加载中…" : "加载更多"}
                    </button>
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

export { CommentSheet }
