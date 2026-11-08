import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CheckCircle2, CircleAlert, CornerDownRight, LoaderCircle, Send, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { submitComment, verifyCaptcha, type Comment } from "@/lib/feedback/api"
import { CaptchaField, type CaptchaValue } from "./captcha"

const DRAFT_KEY = "musicstorm.feedback.draft"
const MAX_CONTENT_LENGTH = 10_000
const MAX_NAME_LENGTH = 120

function readDraft(): string {
    try {
        return sessionStorage.getItem(DRAFT_KEY) ?? ""
    } catch {
        return ""
    }
}

function saveDraft(content: string): void {
    try {
        if (content) {
            sessionStorage.setItem(DRAFT_KEY, content)
        } else {
            sessionStorage.removeItem(DRAFT_KEY)
        }
    } catch {
        // 存储受限时仍允许提交反馈
    }
}

function FeedbackForm({ replyTo, onCancelReply, onCreated }: {
    replyTo: Comment | null
    onCancelReply: () => void
    onCreated: (comment: Comment) => void
}) {
    const [content, setContent] = useState(readDraft)
    const [captcha, setCaptcha] = useState<CaptchaValue>({ id: "", code: "", expiresAt: 0 })
    const [refreshSignal, setRefreshSignal] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [cardOpen, setCardOpen] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const contentRef = useRef<HTMLTextAreaElement>(null)
    const formRef = useRef<HTMLFormElement>(null)
    const busyRef = useRef(false)
    const mountedRef = useRef(true)
    const busy = submitting || verifying

    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    useLayoutEffect(() => {
        const input = contentRef.current
        if (replyTo && input && !input.disabled) {
            input.focus({ preventScroll: true })
            input.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
                block: "start",
            })
        }
    }, [replyTo])

    useEffect(() => {
        if (error && cardOpen && !busy && captcha.id) {
            document.getElementById("feedback-captcha")?.focus()
        }
    }, [error, cardOpen, busy, captcha.id])

    useEffect(() => {
        if (!content.trim()) {
            return
        }
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
        window.addEventListener("beforeunload", warn)
        return () => window.removeEventListener("beforeunload", warn)
    }, [content])

    function openVerification(): void {
        if (busyRef.current || !formRef.current?.reportValidity()) {
            return
        }
        setError("")
        setNotice("")
        if (!content.trim()) {
            setError("请填写问题或建议。")
            contentRef.current?.focus()
            return
        }
        setCardOpen(true)
    }

    async function verifyAndSubmit(): Promise<void> {
        if (busyRef.current) {
            return
        }
        const form = formRef.current
        if (!form?.reportValidity() || !content.trim()) {
            setCardOpen(false)
            contentRef.current?.focus()
            return
        }
        setError("")
        setNotice("")
        if (!captcha.id || !captcha.code.trim() || captcha.expiresAt * 1000 <= Date.now()) {
            setError("请填写有效验证码；验证码过期时请刷新。")
            document.getElementById("feedback-captcha")?.focus()
            return
        }
        const fields = new FormData(form)
        const field = (name: string): string | null => String(fields.get(name) ?? "").trim() || null
        const submission = {
            name: field("name"),
            email: field("email"),
            url: field("url"),
            content: content.trim(),
            parent_uuid: replyTo?.uuid ?? null,
            captcha_id: captcha.id,
            captcha_code: captcha.code.trim(),
        }
        busyRef.current = true
        setVerifying(true)
        try {
            await verifyCaptcha({ id: captcha.id, code: captcha.code })
            if (!mountedRef.current) {
                return
            }
            setVerifying(false)
            setSubmitting(true)
            const created = await submitComment(submission)
            if (readDraft() === content) {
                saveDraft("")
            }
            if (!mountedRef.current) {
                return
            }
            setContent("")
            setCardOpen(false)
            onCancelReply()
            onCreated(created)
            setNotice(created.status === "approved"
                ? "反馈已发布。" : "反馈已提交，审核通过后展示。")
        } catch (error) {
            if (!mountedRef.current) {
                return
            }
            setError(error instanceof Error ? error.message : "提交失败，请稍后重试。")
            document.getElementById("feedback-captcha")?.focus()
        } finally {
            busyRef.current = false
            if (mountedRef.current) {
                setSubmitting(false)
                setVerifying(false)
                setRefreshSignal((value) => value + 1)
            }
        }
    }

    return (
        <form ref={formRef} onSubmit={(event) => {
            event.preventDefault()
            openVerification()
        }} className="feedback-form">
            <h2>{replyTo ? "回复反馈" : "提交反馈"}</h2>
            {replyTo ? <div className="feedback-reply-target" aria-live="polite">
                <CornerDownRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">回复 {replyTo.name || "匿名"}</span>
                <button type="button" aria-label="取消回复" title="取消回复" disabled={busy}
                    onClick={onCancelReply}
                    className="feedback-control feedback-icon">
                    <X className="size-4" aria-hidden="true" />
                </button>
            </div> : null}
            <div className="feedback-field">
                <label htmlFor="feedback-content">问题或建议</label>
                <Textarea ref={contentRef} id="feedback-content" name="content" autoComplete="off"
                    required maxLength={MAX_CONTENT_LENGTH} value={content} disabled={busy}
                    onChange={(event) => {
                        setContent(event.target.value)
                        saveDraft(event.target.value)
                    }}
                    className="feedback-input feedback-composer"
                    placeholder={replyTo
                        ? `回复 @${replyTo.name || "匿名"}…`
                        : "描述遇到的问题、复现步骤，或分享你的建议…"} />
            </div>
            <div className="feedback-contact-fields">
                <label className="feedback-field">
                    <span>昵称</span>
                    <Input name="name" maxLength={MAX_NAME_LENGTH} autoComplete="nickname"
                        spellCheck={false} disabled={busy} className="feedback-input" placeholder="你的昵称…" />
                </label>
                <label className="feedback-field">
                    <span>邮箱</span>
                    <Input name="email" type="email" autoComplete="email" spellCheck={false}
                        aria-describedby="feedback-email-privacy" disabled={busy} className="feedback-input"
                        placeholder="name@example.com…" />
                </label>
                <label className="feedback-field">
                    <span>个人主页</span>
                    <Input name="url" type="url" autoComplete="url" spellCheck={false}
                        disabled={busy} className="feedback-input" placeholder="https://example.com…" />
                </label>
            </div>
            <p id="feedback-email-privacy" className="feedback-footnote">邮箱不会公开显示。</p>
            <div className="feedback-form-actions">
                <Popover open={cardOpen} onOpenChange={(open) => {
                    if (open) {
                        openVerification()
                    } else if (!busyRef.current) {
                        setCardOpen(false)
                    }
                }}>
                    <PopoverTrigger type="submit" render={<button type="submit" disabled={busy}
                        className="feedback-control feedback-submit">
                        {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            : <Send className="size-4" aria-hidden="true" />}
                        {verifying ? "验证中…" : submitting ? "提交中…" : "提交反馈"}
                    </button>} />
                    {cardOpen ? <PopoverContent side="top" align="end" className="feedback-verification">
                        <div className="feedback-verification-header">
                            <PopoverTitle>确认反馈</PopoverTitle>
                            <button type="button" aria-label="关闭验证码" title="关闭验证码" disabled={busy}
                                onClick={() => setCardOpen(false)} className="feedback-control feedback-icon">
                                <X className="size-4" aria-hidden="true" />
                            </button>
                        </div>
                        <CaptchaField value={captcha} onChange={setCaptcha} refreshSignal={refreshSignal}
                            disabled={busy} onConfirm={() => { void verifyAndSubmit() }} />
                        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                        <button type="button" disabled={busy}
                            onClick={() => { void verifyAndSubmit() }}
                            className="feedback-control feedback-submit">
                            {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                            {verifying ? "验证中…" : submitting ? "提交中…" : "验证并提交"}
                        </button>
                    </PopoverContent> : null}
                </Popover>
            </div>
            <div aria-live="polite" className="feedback-status">
                {error && !cardOpen ? <p role="alert" className="text-destructive">
                    <CircleAlert className="size-4 shrink-0" aria-hidden="true" />{error}
                </p> : null}
                {notice ? <p>
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{notice}
                </p> : null}
            </div>
        </form>
    )
}

export { FeedbackForm }
