import { toast } from "@/components/ui/toast"

type NotifyOptions = {
    description?: string
    timeout?: number
    id?: string
}

function formatError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message.trim()
    }
    if (typeof error === "string" && error.trim()) {
        return error.trim()
    }
    return "未知错误"
}

function notifySuccess(title: string, options: NotifyOptions = {}): string {
    return toast.add({
        id: options.id,
        type: "success",
        title,
        description: options.description,
        timeout: options.timeout ?? 3200,
        priority: "low",
    })
}

function notifyInfo(title: string, options: NotifyOptions = {}): string {
    return toast.add({
        id: options.id,
        type: "info",
        title,
        description: options.description,
        timeout: options.timeout ?? 3200,
        priority: "low",
    })
}

function notifyWarning(title: string, options: NotifyOptions = {}): string {
    return toast.add({
        id: options.id,
        type: "warning",
        title,
        description: options.description,
        timeout: options.timeout ?? 3800,
        priority: "low",
    })
}

function notifyError(title: string, options: NotifyOptions = {}): string {
    return toast.add({
        id: options.id,
        type: "error",
        title,
        description: options.description,
        timeout: options.timeout ?? 4800,
        priority: "high",
    })
}

function notifyFromError(
    title: string,
    error: unknown,
    options: Omit<NotifyOptions, "description"> = {},
): string {
    return notifyError(title, {
        ...options,
        description: formatError(error),
    })
}

function notifyLoading(title: string, options: NotifyOptions = {}): string {
    return toast.add({
        id: options.id,
        type: "loading",
        title,
        description: options.description,
        timeout: options.timeout ?? 0,
        priority: "low",
    })
}

function notifyDismiss(id?: string): void {
    toast.close(id)
}

type PromiseMessage<T> =
    | string
    | { title: string; description?: string }
    | ((data: T) => string | { title: string; description?: string })

type NotifyPromiseOptions<T> = {
    /** 等待期文案，如「签到中…」 */
    loading: string | { title: string; description?: string }
    /** 成功文案，可拿到 resolve 值拼装 */
    success: PromiseMessage<T>
    /** 失败文案，可拿到 error 拼装 */
    error: PromiseMessage<unknown>
    timeout?: number
}

function resolvePromiseMessage<T>(
    message: PromiseMessage<T>,
    data: T,
): { title: string; description?: string } {
    const resolved =
        typeof message === "function" ? message(data) : message
    return typeof resolved === "string" ? { title: resolved } : resolved
}

/**
 * Promise 状态 toast：loading（不自动关）→ 成功/失败就地变换类型与文案。
 * 适合签到、清理缓存等有明确终态的异步动作。
 */
function notifyPromise<T>(
    promise: Promise<T>,
    options: NotifyPromiseOptions<T>,
): Promise<T> {
    const loadingMsg =
        typeof options.loading === "string"
            ? { title: options.loading }
            : options.loading
    const id = notifyLoading(loadingMsg.title, {
        description: loadingMsg.description,
        timeout: 0,
    })
    promise.then(
        (data) => {
            const message = resolvePromiseMessage(options.success, data)
            notifyUpdate(id, {
                type: "success",
                title: message.title,
                description: message.description,
                timeout: options.timeout ?? 3600,
            })
        },
        (error: unknown) => {
            const message = resolvePromiseMessage(options.error, error)
            notifyUpdate(id, {
                type: "error",
                title: message.title,
                description: message.description ?? formatError(error),
                timeout: options.timeout ?? 4800,
            })
        },
    )
    return promise
}

function notifyUpdate(
    id: string,
    next: {
        type?: "success" | "error" | "info" | "warning" | "loading"
        title?: string
        description?: string
        timeout?: number
    },
): void {
    toast.update(id, {
        type: next.type,
        title: next.title,
        description: next.description,
        timeout: next.timeout,
    })
}

export {
    formatError,
    notifyDismiss,
    notifyError,
    notifyFromError,
    notifyInfo,
    notifyLoading,
    notifyPromise,
    notifySuccess,
    notifyUpdate,
    notifyWarning,
}