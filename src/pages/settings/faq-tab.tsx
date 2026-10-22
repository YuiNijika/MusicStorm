import { useEffect, useState } from "react"
import { MessageSquare, RotateCw } from "lucide-react"

import { ArticleContent } from "@/components/article-content"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchArticle } from "@/lib/feedback/api"
import { isWebMode } from "@/lib/web-mode"
import { ActionButton } from "@/pages/settings/settings-ui"

function FaqTab({ onOpenFeedback }: { onOpenFeedback: () => void }) {
    const [content, setContent] = useState("")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError("")
        void fetchArticle(controller.signal).then((article) => {
            if (!controller.signal.aborted) {
                setContent(article.content)
            }
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) {
                setError(error instanceof Error ? error.message : "加载失败，请重试。")
            }
        }).finally(() => {
            if (!controller.signal.aborted) {
                setLoading(false)
            }
        })
        return () => controller.abort()
    }, [attempt])

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">常见问题</h2>
                <a href="#/feedback"
                    onClick={(event) => {
                        if (isWebMode() && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
                            return
                        }
                        event.preventDefault()
                        onOpenFeedback()
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-[var(--surface-fill)] focus-visible:outline-2 focus-visible:outline-ring">
                    <MessageSquare className="size-4" aria-hidden="true" />
                    反馈问题
                </a>
            </header>
            <div aria-live="polite">
                {loading ? <div role="status" aria-label="常见问题加载中" className="space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-4/5" />
                </div>
                    : error ? <div className="space-y-2">
                        <p role="alert" className="text-sm text-destructive">{error}</p>
                        <ActionButton icon={<RotateCw className="size-4" aria-hidden="true" />}
                            onClick={() => setAttempt((value) => value + 1)}
                            className="focus-visible:outline-2 focus-visible:outline-ring">重试</ActionButton>
                    </div>
                    : content.trim() ? <ArticleContent content={content} />
                        : <p className="text-sm text-muted-foreground">暂无常见问题。</p>}
            </div>
        </div>
    )
}

export { FaqTab }
