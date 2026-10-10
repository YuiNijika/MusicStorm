const API_BASE = "https://api.miomoe.cn"
const ARTICLE_PATH = "/blog/articles/musicstorm-issues"
const REQUEST_TIMEOUT_MS = 20_000

export interface Article {
    content: string
    comment_status: "open" | "closed"
}

export interface Comment {
    uuid: string
    parent_uuid: string | null
    name: string | null
    avatar: string | null
    url: string | null
    content: string
    status: "pending" | "approved" | "rejected"
    created_at: string
}

export interface Captcha {
    id: string
    image: string
    expires_at: number
}

export interface Submission {
    name: string | null
    email: string | null
    url: string | null
    content: string
    parent_uuid: string | null
    captcha_id: string
    captcha_code: string
}

export class FeedbackError extends Error {
    constructor(message: string, readonly code?: string) {
        super(message)
        this.name = "FeedbackError"
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    init.signal?.addEventListener("abort", abort, { once: true })
    if (init.signal?.aborted) {
        abort()
    }
    const timeout = window.setTimeout(abort, REQUEST_TIMEOUT_MS)
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            ...init,
            credentials: "omit",
            headers: {
                Accept: "application/json",
                ...(init.body ? { "Content-Type": "application/json" } : {}),
            },
            signal: controller.signal,
        })
        const body: unknown = await response.json()
        if (!isRecord(body)) {
            throw new FeedbackError("返回内容无效，请稍后重试。")
        }
        if (!response.ok || body.success !== true) {
            throw new FeedbackError(
                typeof body.message === "string" ? body.message : "请求失败，请稍后重试。",
                typeof body.error_code === "string" ? body.error_code : undefined,
            )
        }
        return body.data
    } catch (error) {
        if (error instanceof FeedbackError || init.signal?.aborted) {
            throw error
        }
        throw new FeedbackError(
            controller.signal.aborted
                ? "请求超时，请重试。"
                : "无法连接，请检查网络后重试。",
        )
    } finally {
        window.clearTimeout(timeout)
        init.signal?.removeEventListener("abort", abort)
    }
}

export async function fetchArticle(signal?: AbortSignal): Promise<Article> {
    const data = await request(ARTICLE_PATH, { signal })
    if (!isRecord(data) || typeof data.content !== "string"
        || (data.comment_status !== "open" && data.comment_status !== "closed")) {
        throw new FeedbackError("常见问题内容无效，请稍后重试。")
    }
    return { content: data.content, comment_status: data.comment_status }
}

function parseComment(data: unknown): Comment {
    if (!isRecord(data) || typeof data.uuid !== "string"
        || typeof data.content !== "string" || typeof data.created_at !== "string"
        || !["pending", "approved", "rejected"].includes(String(data.status))) {
        throw new FeedbackError("反馈内容无效，请稍后重试。")
    }
    return {
        uuid: data.uuid,
        content: data.content,
        created_at: data.created_at,
        status: data.status as Comment["status"],
        parent_uuid: typeof data.parent_uuid === "string" ? data.parent_uuid : null,
        name: typeof data.name === "string" ? data.name : null,
        avatar: typeof data.avatar === "string" ? data.avatar : null,
        url: typeof data.url === "string" ? data.url : null,
    }
}

export async function fetchComments(signal?: AbortSignal): Promise<Comment[]> {
    const data = await request(`${ARTICLE_PATH}/comments`, { signal })
    if (!Array.isArray(data)) {
        throw new FeedbackError("反馈列表无效，请稍后重试。")
    }
    return data.map(parseComment)
}

export async function fetchCaptcha(signal?: AbortSignal): Promise<Captcha> {
    const data = await request("/auth/captcha", { signal })
    if (!isRecord(data) || typeof data.id !== "string" || typeof data.image !== "string"
        || typeof data.expires_at !== "number") {
        throw new FeedbackError("验证码加载失败，请刷新。")
    }
    return { id: data.id, image: data.image, expires_at: data.expires_at }
}

export async function submitComment(submission: Submission): Promise<Comment> {
    const data = await request(`${ARTICLE_PATH}/comments`, {
        method: "POST",
        body: JSON.stringify(submission),
    })
    return parseComment(data)
}

export async function verifyCaptcha(value: { id: string; code: string }): Promise<void> {
    const data = await request("/auth/captcha/verify", {
        method: "POST",
        body: JSON.stringify({ captcha_id: value.id, captcha_code: value.code.trim() }),
    })
    if (!isRecord(data) || data.valid !== true) {
        throw new FeedbackError("验证码错误或已过期，请重新填写。", "CAPTCHA_INVALID")
    }
}

export function safeWebUrl(value: string | null): string | undefined {
    if (!value) {
        return undefined
    }
    try {
        const url = new URL(value)
        return ["https:", "http:"].includes(url.protocol) ? url.href : undefined
    } catch {
        return undefined
    }
}
