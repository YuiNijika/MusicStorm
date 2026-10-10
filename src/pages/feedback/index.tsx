import { useEffect, useState } from "react"
import { ChevronLeft, CircleAlert, RotateCw } from "lucide-react"

import { PageTitle } from "@/components/music/page-title"
import { fetchArticle, fetchComments, type Comment } from "@/lib/feedback/api"
import { isWebMode } from "@/lib/web-mode"
import { Comments } from "./comments"
import { FeedbackForm } from "./form"
import { Skeleton } from "./skeleton"
import "./style.css"

function FeedbackPage({ onBack }: { onBack: () => void }) {
    const [comments, setComments] = useState<Comment[]>([])
    const [replyTo, setReplyTo] = useState<Comment | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError("")
        void Promise.all([fetchArticle(controller.signal), fetchComments(controller.signal)])
            .then(([article, comments]) => {
                if (!controller.signal.aborted) {
                    setComments(comments)
                    setIsOpen(article.comment_status === "open")
                }
            }).catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setError(error instanceof Error ? error.message : "反馈加载失败，请重试。")
                }
            }).finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            })
        return () => controller.abort()
    }, [attempt])

    return (
        <div className="feedback-page">
            <PageTitle title="反馈与提议" trailing={
                <a href="#/settings" aria-label="返回设置" title="返回设置"
                    onClick={(event) => {
                        if (isWebMode() && (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) {
                            return
                        }
                        event.preventDefault()
                        onBack()
                    }}
                    className="feedback-control feedback-back">
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </a>
            } />
            {loading ? <Skeleton />
                : error ? <div className="feedback-state">
                    <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
                    <p role="alert">{error}</p>
                    <button type="button" onClick={() => setAttempt((value) => value + 1)}
                        className="feedback-control feedback-secondary">
                        <RotateCw className="size-4" aria-hidden="true" />重试
                    </button>
                </div>
                    : <>
                        {isOpen ? <FeedbackForm replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
                            onCreated={(comment) => setComments((current) => [...current, comment])} />
                            : <p role="status" className="feedback-closed">暂时停止接收新反馈。</p>}
                        <Comments comments={comments} onReply={(comment) => {
                            setReplyTo({ ...comment })
                        }} canReply={isOpen} />
                    </>}
        </div>
    )
}

export { FeedbackPage }
