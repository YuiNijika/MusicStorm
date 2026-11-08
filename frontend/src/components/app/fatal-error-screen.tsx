import React from "react"

import { cn } from "@/lib/utils"

type FatalErrorScreenProps = {
    /** boundary 模式包裹正常应用；boot 模式直接渲染失败页 */
    variant?: "boundary" | "boot"
    children?: React.ReactNode
    /** boot 模式下的原始错误（boundary 捕获的运行时错误也会存到 state） */
    error?: unknown
}

function formatErrorDetail(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`
    }
    try {
        return JSON.stringify(error) ?? String(error)
    } catch {
        return String(error)
    }
}

/**
 * 应用级致命错误页：boot 期代码包加载失败与运行时未捕获渲染错误共用。
 * 深浅主题自动适配，展示错误摘要 + 重载按钮，替代裸文本的旧失败样式。
 */
class FatalErrorScreen extends React.Component<
    FatalErrorScreenProps,
    { error: unknown | null }
> {
    constructor(props: FatalErrorScreenProps) {
        super(props)
        this.state = { error: props.error ?? null }
    }

    static getDerivedStateFromError(error: unknown) {
        return { error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("[fatal] 渲染错误", error, info.componentStack)
    }

    render() {
        const error = this.state.error
        if (!error) {
            return this.props.children
        }

        const detail = formatErrorDetail(error)

        return (
            <div
                className={cn(
                    "fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 p-6",
                    "bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100",
                )}
            >
                <img
                    src="/icon.svg"
                    alt=""
                    className="size-14 opacity-70"
                    aria-hidden="true"
                />
                <div className="flex flex-col items-center gap-1.5 text-center">
                    <p className="text-[17px] font-semibold tracking-[-0.01em]">
                        应用加载失败
                    </p>
                    <p className="max-w-md text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                        资源加载或渲染出了点问题，通常是网络波动或缓存损坏。点击重试通常可以解决；若反复出现，请尝试清除应用缓存后重启。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="h-10 cursor-pointer rounded-full bg-neutral-900 px-6 text-[13px] font-medium text-white transition-transform active:scale-[0.97] dark:bg-white dark:text-neutral-900"
                >
                    重新加载
                </button>
                <details className="mt-2 w-full max-w-lg">
                    <summary className="cursor-pointer text-[12px] text-neutral-400 select-none hover:text-neutral-600 dark:hover:text-neutral-300">
                        错误详情
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-neutral-100 p-3 text-left text-[11px] leading-relaxed break-all whitespace-pre-wrap text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                        {detail}
                    </pre>
                </details>
            </div>
        )
    }
}

export { FatalErrorScreen }
