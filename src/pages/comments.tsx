import { Heart, LoaderCircle, MessageCircle, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { SortSelect } from "@/components/music/sort-select"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Textarea } from "@/components/ui/textarea"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import {
    fetchCommentReplies,
    fetchSongComments,
    fetchSongStats,
    postSongComment,
    type CommentSortType,
    type NeteaseComment,
    type SongStats,
} from "@/lib/netease/comment"
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20
const REPLY_PAGE_SIZE = 20

const SORT_OPTIONS: ReadonlyArray<{ value: CommentSortType; label: string }> = [
    { value: "hot", label: "最热" },
    { value: "time", label: "最新" },
]

type CommentsPageProps = {
    trackId: string
    title?: string
    subtitle?: string
    onBack: () => void
}

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

function ReplyItem({
    comment,
    onReply,
}: {
    comment: NeteaseComment
    onReply: () => void
}) {
    const user = comment.user
    const nickname = user?.nickname?.trim() || "网易云用户"
    const [avatarFailed, setAvatarFailed] = useState(false)

    return (
        <div className="flex gap-2.5 rounded-xl bg-[var(--surface-fill)]/50 p-2.5">
            {avatarFailed || !user?.avatarUrl ? (
                <span className="size-6 shrink-0 rounded-full bg-[var(--surface-fill)]" />
            ) : (
                <img
                    src={user.avatarUrl}
                    alt={nickname}
                    loading="lazy"
                    onError={() => setAvatarFailed(true)}
                    className="size-6 shrink-0 rounded-full object-cover"
                />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-medium text-foreground">
                        {nickname}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatCommentTime(comment.time)}
                    </span>
                </div>
                <p className="mt-0.5 break-words whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                    {comment.content}
                </p>
                <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                    {comment.ipLocation?.location ? (
                        <span>{comment.ipLocation.location}</span>
                    ) : null}
                    {comment.likedCount > 0 ? (
                        <span className="flex items-center gap-1">
                            <Heart className="size-2.5" />
                            {formatCount(comment.likedCount)}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={onReply}
                        className="cursor-pointer hover:text-foreground"
                    >
                        回复
                    </button>
                </div>
            </div>
        </div>
    )
}

function CommentItem({
    comment,
    hot = false,
    onReply,
}: {
    comment: NeteaseComment
    hot?: boolean
    onReply: () => void
}) {
    const user = comment.user
    const nickname = user?.nickname?.trim() || "网易云用户"
    const replied = comment.beReplied?.[0]
    const [avatarFailed, setAvatarFailed] = useState(false)

    const [replies, setReplies] = useState<NeteaseComment[]>([])
    const [replyTotal, setReplyTotal] = useState(0)
    const [replyMore, setReplyMore] = useState(false)
    const [replyLoading, setReplyLoading] = useState(false)
    const [showAllReplies, setShowAllReplies] = useState(false)
    const replyOffsetRef = useRef(0)

    const loadReplies = useCallback(
        async (append: boolean) => {
            if (replyLoading) {
                return
            }
            setReplyLoading(true)
            try {
                const nextOffset = append ? replyOffsetRef.current + REPLY_PAGE_SIZE : 0
                const data = await fetchCommentReplies(String(comment.commentId), {
                    limit: REPLY_PAGE_SIZE,
                    offset: nextOffset,
                })
                replyOffsetRef.current = nextOffset
                setReplies((prev) => {
                    if (append) {
                        const seen = new Set(prev.map((item) => item.commentId))
                        const merged = data.comments.filter(
                            (item) => !seen.has(item.commentId),
                        )
                        return [...prev, ...merged]
                    }
                    return data.comments
                })
                setReplyTotal(data.total)
                setReplyMore(data.more && data.comments.length > 0)
            } catch {
                // 加载失败保持现状
            } finally {
                setReplyLoading(false)
            }
        },
        [comment.commentId, replyLoading],
    )

    const handleExpandReplies = useCallback(() => {
        setShowAllReplies(true)
        void loadReplies(false)
    }, [loadReplies])

    return (
        <div className="space-y-2.5">
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
                        <p className="mt-1 truncate rounded-xl bg-[var(--surface-fill)] px-2.5 py-1.5 text-[12px] text-muted-foreground">
                            <span className="font-medium">
                                @{replied.user?.nickname?.trim() || "用户"}
                            </span>
                            ：{replied.content}
                        </p>
                    ) : null}
                    <p className="mt-1.5 break-words whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                        {comment.content}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        {comment.ipLocation?.location ? (
                            <span>{comment.ipLocation.location}</span>
                        ) : null}
                        {comment.likedCount > 0 ? (
                            <span className="flex items-center gap-1">
                                <Heart className="size-3" />
                                {formatCount(comment.likedCount)}
                            </span>
                        ) : null}
                        <button
                            type="button"
                            onClick={onReply}
                            className="cursor-pointer hover:text-foreground"
                        >
                            回复
                        </button>
                    </div>
                </div>
            </div>

            {showAllReplies && replies.length > 0 ? (
                <div className="ml-12 space-y-2.5 border-l-2 border-[var(--surface-fill)] pl-3">
                    {replies.map((reply) => (
                        <ReplyItem
                            key={reply.commentId}
                            comment={reply}
                            onReply={onReply}
                        />
                    ))}
                    {replyLoading ? (
                        <p className="py-2 text-center text-[11px] text-muted-foreground">
                            加载中…
                        </p>
                    ) : replyMore ? (
                        <button
                            type="button"
                            onClick={() => void loadReplies(true)}
                            className="w-full cursor-pointer py-2 text-center text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                            加载更多回复
                        </button>
                    ) : null}
                </div>
            ) : !showAllReplies && replyTotal > 0 ? (
                <button
                    type="button"
                    onClick={handleExpandReplies}
                    className="ml-12 cursor-pointer py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                    查看 {replyTotal} 条回复
                </button>
            ) : null}
        </div>
    )
}

function CommentsPage({ trackId, title, subtitle, onBack }: CommentsPageProps) {
    const { loggedIn, profile } = useNeteaseSession()
    const [comments, setComments] = useState<NeteaseComment[]>([])
    const [hotComments, setHotComments] = useState<NeteaseComment[]>([])
    const [total, setTotal] = useState(0)
    const [stats, setStats] = useState<SongStats | null>(null)
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const offsetRef = useRef(0)
    const [sortBy, setSortBy] = useState<CommentSortType>("hot")

    const [content, setContent] = useState("")
    const [posting, setPosting] = useState(false)
    const [replyTarget, setReplyTarget] = useState<{
        commentId: number
        nickname: string
    } | null>(null)
    const composerRef = useRef<HTMLTextAreaElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        let cancelled = false
        setStatus("loading")
        setComments([])
        setHotComments([])
        setTotal(0)
        setStats(null)
        setHasMore(false)
        offsetRef.current = 0

        void Promise.all([
            fetchSongComments(trackId, { limit: PAGE_SIZE, offset: 0, sort: sortBy }),
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
    }, [trackId, sortBy])

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) {
            return
        }
        setLoadingMore(true)
        try {
            const nextOffset = offsetRef.current + PAGE_SIZE
            const data = await fetchSongComments(trackId, {
                limit: PAGE_SIZE,
                offset: nextOffset,
                sort: sortBy,
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
    }, [trackId, sortBy, loadingMore, hasMore])

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) {
            return
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    void loadMore()
                }
            },
            { rootMargin: "200px" },
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [loadMore])

    function focusComposer() {
        composerRef.current?.focus()
    }

    function handleReply(comment: NeteaseComment) {
        setReplyTarget({
            commentId: comment.commentId,
            nickname: comment.user?.nickname?.trim() || "网易云用户",
        })
        focusComposer()
    }

    async function handlePost() {
        const text = content.trim()
        if (!text) {
            notifyError("评论内容不能为空")
            return
        }
        if (!loggedIn) {
            notifyInfo("请先登录网易云", {
                description: "侧栏或设置中登录后可发布评论",
            })
            return
        }
        if (posting) {
            return
        }
        setPosting(true)
        try {
            const posted = await postSongComment(
                trackId,
                text,
                replyTarget ?? undefined,
            )
            setComments((prev) => [posted, ...prev])
            setContent("")
            setReplyTarget(null)
            setTotal((n) => n + 1)
            notifySuccess(replyTarget ? "回复已发布" : "评论已发布")
        } catch (error) {
            notifyError(replyTarget ? "回复失败" : "评论发布失败", {
                description: error instanceof Error ? error.message : undefined,
            })
        } finally {
            setPosting(false)
        }
    }

    const heading = title ? `《${title}》的评论` : "歌曲评论"

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <BackButton onClick={onBack} />
                    <h1 className="mt-2 truncate text-[22px] font-bold tracking-[-0.04em] md:text-[26px]">
                        {heading}
                    </h1>
                    {subtitle ? (
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                            {subtitle}
                        </p>
                    ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3 pt-9">
                    {total > 0 ? (
                        <span className="text-[12px] text-muted-foreground">
                            评论 {formatCount(total)}
                        </span>
                    ) : null}
                    {stats && stats.likedCount > 0 ? (
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Heart className="size-3 text-rose-500" />
                            收藏 {formatCount(stats.likedCount)}
                        </span>
                    ) : null}
                    <SortSelect
                        value={sortBy}
                        options={SORT_OPTIONS}
                        onChange={setSortBy}
                        label="评论排序"
                    />
                </div>
            </div>

            <div className="apple-list-surface rounded-2xl p-4 space-y-3">
                {status === "loading" ? (
                    <p className="py-10 text-center text-[12px] text-muted-foreground">
                        加载评论…
                    </p>
                ) : status === "error" ? (
                    <p className="py-10 text-center text-[12px] text-muted-foreground">
                        评论加载失败
                    </p>
                ) : comments.length === 0 && hotComments.length === 0 ? (
                    <p className="py-10 text-center text-[12px] text-muted-foreground">
                        暂无评论，来抢沙发
                    </p>
                ) : (
                    <>
                        {hotComments.length > 0 ? (
                            <div>
                                <p className="mb-2 text-[13px] font-semibold text-foreground">
                                    精彩评论
                                </p>
                                <div className="space-y-3">
                                    {hotComments.map((comment) => (
                                        <CommentItem
                                            key={comment.commentId}
                                            comment={comment}
                                            hot
                                            onReply={() => handleReply(comment)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {comments.length > 0 ? (
                            <div>
                                {hotComments.length > 0 ? (
                                    <p className="mb-2 text-[13px] font-semibold text-foreground">
                                        最新评论
                                    </p>
                                ) : null}
                                <div className="space-y-3">
                                    {comments.map((comment) => (
                                        <CommentItem
                                            key={comment.commentId}
                                            comment={comment}
                                            onReply={() => handleReply(comment)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

                {loadingMore ? (
                    <p className="flex justify-center py-4 text-[12px] text-muted-foreground">
                        <LoadingSpinner size={18} />
                    </p>
                ) : null}

                <div ref={sentinelRef} />
            </div>

            <div className="sticky bottom-4 z-10 rounded-2xl border border-[var(--separator)] bg-[var(--surface-raised)]/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.14)] backdrop-blur">
                {replyTarget ? (
                    <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                        <MessageCircle className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                            回复 @{replyTarget.nickname}
                        </span>
                        <button
                            type="button"
                            onClick={() => setReplyTarget(null)}
                            className="shrink-0 cursor-pointer text-[11px] text-muted-foreground/70 hover:text-foreground"
                        >
                            取消
                        </button>
                    </div>
                ) : null}
                <div className="flex items-end gap-2">
                    {loggedIn && profile?.avatarUrl ? (
                        <img
                            src={profile.avatarUrl}
                            alt={profile.nickname ?? "我"}
                            loading="lazy"
                            decoding="async"
                            className="size-8 shrink-0 rounded-full object-cover"
                        />
                    ) : (
                        <span className="size-8 shrink-0 rounded-full bg-[var(--surface-fill)]" />
                    )}
                    <Textarea
                        ref={composerRef}
                        value={content}
                        onChange={(event) => setContent(event.currentTarget.value)}
                        placeholder={
                            loggedIn
                                ? replyTarget
                                    ? "写下你的回复…"
                                    : "写下你的评论…"
                                : "登录后参与评论"
                        }
                        rows={1}
                        className="min-h-9 flex-1 resize-none"
                    />
                    <button
                        type="button"
                        disabled={posting || !content.trim()}
                        onClick={() => void handlePost()}
                        className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[12px] font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {posting ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                            <Send className="size-3.5" />
                        )}
                        发布
                    </button>
                </div>
            </div>
        </div>
    )
}

export { CommentsPage }
