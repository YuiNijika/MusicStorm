import { useCallback, useMemo, useState } from "react"
import { MessageCircleReply } from "lucide-react"

import { safeWebUrl, type Comment } from "@/lib/feedback/api"
import { openExternalUrl } from "@/lib/open-external"
import { isWebMode } from "@/lib/web-mode"
import { Content } from "./content"
import {
    VariableVirtualList,
    type FocusRequest,
} from "./virtual-comments"

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
})

function commentDate(raw: string): string {
    const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}+08:00`)
    return Number.isNaN(date.getTime()) ? raw : dateFormatter.format(date)
}

type CommentThread = {
    root: Comment
    replies: Comment[]
}

function CommentRow({ comment, onReply, canReply, replyTo, onLocateReply }: {
    comment: Comment
    onReply: () => void
    canReply: boolean
    replyTo?: Comment
    onLocateReply?: () => void
}) {
    const [imageFailed, setImageFailed] = useState(false)
    const name = comment.name || "匿名"
    const avatar = safeWebUrl(comment.avatar)
    const url = safeWebUrl(comment.url)
    return (
        <article id={`feedback-comment-${comment.uuid}`} tabIndex={-1} className="feedback-comment">
            {avatar && !imageFailed
                ? <img src={avatar} alt="" width={36} height={36} loading="lazy"
                    onError={() => setImageFailed(true)} className="feedback-avatar" />
                : <span aria-hidden="true" className="feedback-avatar feedback-avatar-fallback">{Array.from(name)[0]?.toUpperCase()}</span>}
            <div className="feedback-comment-body">
                <div className="feedback-comment-meta">
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer"
                        onClick={(event) => {
                            if (isWebMode()) {
                                return
                            }
                            event.preventDefault()
                            void openExternalUrl(url)
                        }}
                        className="feedback-comment-name">{name}</a>
                        : <span className="feedback-comment-name">{name}</span>}
                    <time className="feedback-comment-date">{commentDate(comment.created_at)}</time>
                </div>
                <Content content={comment.content} prefix={replyTo ? <button type="button"
                    aria-label={`查看 ${replyTo.name || "匿名"} 的评论`}
                    title="定位到被回复的评论"
                    onClick={onLocateReply}
                    className="feedback-mention">
                    @{replyTo.name || "匿名"}
                </button> : null} />
                {canReply ? <button type="button" onClick={onReply}
                    aria-label={`回复 ${name}`} title={`回复 ${name}`}
                    className="feedback-reply">
                    <MessageCircleReply className="size-3" aria-hidden="true" />
                    回复
                </button> : null}
            </div>
        </article>
    )
}

function Comments({ comments, onReply, canReply }: {
    comments: Comment[]
    onReply: (comment: Comment) => void
    canReply: boolean
}) {
    const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
    const threads = useMemo<CommentThread[]>(() => {
        const approved = comments.filter((comment) => comment.status === "approved")
        const ids = new Set(approved.map((comment) => comment.uuid))
        const replies = new Map<string, Comment[]>()
        const roots: Comment[] = []
        for (const comment of approved) {
            if (comment.parent_uuid && ids.has(comment.parent_uuid)) {
                const list = replies.get(comment.parent_uuid) ?? []
                list.push(comment)
                replies.set(comment.parent_uuid, list)
            } else {
                roots.push(comment)
            }
        }
        return roots.map((root) => ({ root, replies: replies.get(root.uuid) ?? [] }))
    }, [comments])
    const threadKeyByComment = useMemo(() => {
        const result = new Map<string, string>()
        for (const { root, replies } of threads) {
            result.set(root.uuid, root.uuid)
            for (const reply of replies) {
                result.set(reply.uuid, root.uuid)
            }
        }
        return result
    }, [threads])

    const locateComment = useCallback((comment: Comment) => {
        const itemKey = threadKeyByComment.get(comment.uuid)
        if (!itemKey) {
            return
        }
        setFocusRequest((current) => ({
            itemKey,
            elementId: `feedback-comment-${comment.uuid}`,
            requestId: (current?.requestId ?? 0) + 1,
        }))
    }, [threadKeyByComment])

    const handleFocusRequest = useCallback((requestId: number) => {
        setFocusRequest((current) =>
            current?.requestId === requestId ? null : current,
        )
    }, [])
    const getThreadKey = useCallback(
        ({ root }: CommentThread) => root.uuid,
        [],
    )

    return (
        <section aria-labelledby="feedback-comments-title" className="feedback-comments">
            <header className="feedback-section-header">
                <h2 id="feedback-comments-title">全部反馈</h2>
                {threads.length > 0 ? <span className="feedback-count">
                    {new Intl.NumberFormat().format(threads.reduce((count, thread) => count + 1 + thread.replies.length, 0))}
                </span> : null}
            </header>
            {threads.length === 0 ? <p className="feedback-comments-empty">暂无反馈。</p> : null}
            <VariableVirtualList
                items={threads}
                getItemKey={getThreadKey}
                estimatedItemHeight={180}
                focusRequest={focusRequest}
                onFocusRequestHandled={handleFocusRequest}
                renderItem={({ root, replies }) => (
                    <>
                        <CommentRow comment={root} canReply={canReply} onReply={() => onReply(root)} />
                        {replies.length > 0 ? <div className="feedback-thread-replies">
                            {replies.map((reply) => <CommentRow key={reply.uuid} comment={reply}
                                replyTo={root} canReply={canReply}
                                onLocateReply={() => locateComment(root)}
                                onReply={() => onReply(root)} />)}
                        </div> : null}
                    </>
                )}
            />
        </section>
    )
}

export { Comments }
