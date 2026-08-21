import { Heart, LoaderCircle, MessageCircle, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Textarea } from "@/components/ui/textarea"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import {
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

function CommentItem({
    comment,
    hot = false,
    onReply,
    level = 1,
}: {
    comment: NeteaseComment
    hot?: boolean
    onReply: () => void
    level?: number
}) {
    const user = comment.user
    const nickname = user?.nickname?.trim() || "网易云用户"
    const replied = comment.beReplied?.[0]
    const [avatarFailed, setAvatarFailed] = useState(false)

    // 三级及以上：引用被回复内容
    const isQuoted = level >= 3 && replied

    return (
        <div className={cn("flex gap-3", level > 1 && "ml-8 mt-2")}>
            {avatarFailed || !user?.avatarUrl ? (
                <span className={cn("shrink-0 rounded-full bg-[var(--surface-fill)]", level > 2 ? "size-6" : "size-9")} />
            ) : (
                <img
                    src={user.avatarUrl}
                    alt={nickname}
                    loading="lazy"
                    onError={() => setAvatarFailed(true)}
                    className={cn("shrink-0 rounded-full object-cover", level > 2 ? "size-6" : "size-9")}
                />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "truncate font-medium",
                            level > 2 ? "text-[11px]" : "text-[12px]",
                            hot ? "text-primary" : "text-foreground",
                        )}
                    >
                        {nickname}
                    </span>
                    <span className={cn("shrink-0 text-muted-foreground", level > 2 ? "text-[10px]" : "text-[11px]")}>
                        {formatCommentTime(comment.time)}
                    </span>
                </div>
                {isQuoted && replied ? (
                    <p className="mt-1 truncate rounded-lg bg-[var(--surface-fill)] px-2.5 py-1 text-[11px] text-muted-foreground">
                        <span className="font-medium">
                            @{replied.user?.nickname?.trim() || "用户"}
                        </span>
                        ：{replied.content}
                    </p>
                ) : replied && level === 2 ? (
                    <p className="mt-1 truncate rounded-lg bg-[var(--surface-fill)] px-2.5 py-1 text-[12px] text-muted-foreground">
                        <span className="font-medium">
                            @{replied.user?.nickname?.trim() || "用户"}
                        </span>
                        ：{replied.content}
                    </p>
                ) : null}
                <p className={cn(
                    "mt-1 break-words whitespace-pre-wrap leading-relaxed text-foreground",
                    level > 2 ? "text-[12px]" : "text-[13px]",
                )}>
                    {comment.content}
                </p>
                <div className={cn("mt-1 flex items-center gap-3 text-muted-foreground", level > 2 ? "text-[10px]" : "text-[11px]")}>
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

    async function loadMore() {
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
    }

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
        <div className="space-y-6">
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
                <div className="flex shrink-0 items-center gap-3 pt-9 text-[12px] text-muted-foreground">
                    {total > 0 ? <span>评论 {formatCount(total)}</span> : null}
                    {stats && stats.likedCount > 0 ? (
                        <span className="flex items-center gap-1">
                            <Heart className="size-3 text-rose-500" />
                            收藏 {formatCount(stats.likedCount)}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="space-y-5">
                {/* 排序切换 */}
                <div className="flex items-center gap-1 rounded-full bg-[var(--surface-fill)] p-0.5">
                    <button
                        type="button"
                        onClick={() => setSortBy("hot")}
                        className={cn(
                            "flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                            sortBy === "hot"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        最热
                    </button>
                    <button
                        type="button"
                        onClick={() => setSortBy("time")}
                        className={cn(
                            "flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                            sortBy === "time"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        最新
                    </button>
                </div>

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
                        暂无评论，来抢沙发
                    </p>
                ) : (
                    <>
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
                                            onReply={() => handleReply(comment)}
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
                                            onReply={() => handleReply(comment)}
                                            level={comment.beReplied?.length ? 2 : 1}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

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
