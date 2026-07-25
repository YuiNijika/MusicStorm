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

/** 失败场景：标题 + 错误详情 */
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
    notifySuccess,
    notifyUpdate,
    notifyWarning,
}