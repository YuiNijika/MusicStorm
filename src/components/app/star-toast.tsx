import { Tv, X } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

function GithubMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.04 11.04 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
    )
}

const STAR_TOAST_DISMISSED_KEY = "musicstorm-star-toast-dismissed"
const GITHUB_URL = "https://github.com/YuiNijika/MusicStorm"
const BILIBILI_URL = "https://space.bilibili.com/435502585"

function readDismissed(): boolean {
    try {
        return window.localStorage.getItem(STAR_TOAST_DISMISSED_KEY) === "1"
    } catch {
        return false
    }
}

/**
 * 进入应用的求 star 通知（bottom-center，toast 同款材质）。
 * 只有用户点「关闭」才永久不再触发（本地状态丢失后会重新出现）；
 * 路由刷新、不点关闭直接退出等都不算关闭，下次启动照样弹。
 */
function StarToast() {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (readDismissed()) {
            return
        }
        // 等首屏稳定后再冒出来，别和启动期的其他 toast 抢位置
        const timer = window.setTimeout(() => setOpen(true), 3200)
        return () => {
            window.clearTimeout(timer)
        }
    }, [])

    function dismiss() {
        setOpen(false)
        try {
            window.localStorage.setItem(STAR_TOAST_DISMISSED_KEY, "1")
        } catch {
            // 写不进就仅本次会话关闭
        }
    }

    if (!open) {
        return null
    }

    return (
        <div
            role="status"
            className={cn(
                "pointer-events-auto fixed bottom-8 left-1/2 z-[210] w-[min(92vw,440px)] -translate-x-1/2",
                "rounded-2xl border border-black/[0.08] bg-popover text-popover-foreground shadow-lg backdrop-blur-xl",
                "dark:border-white/[0.1] dark:bg-zinc-900/95",
                "p-4",
            )}
        >
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">
                    🙏
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[13px] font-semibold leading-snug">
                        喜欢的话，点个 star 罢！
                    </p>
                    <p className="text-[12px] leading-snug text-muted-foreground">
                        本项目完全开源免费，与网易云音乐及其关联公司无隶属、授权或合作关系（纯纯路人）。遇到问题欢迎去
                        GitHub 提 issue，或者来 B
                        站找UP主唠嗑～觉得好用就顺手赏个 star 罢，跪求！
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="关闭"
                    onClick={dismiss}
                    className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <X className="size-4" aria-hidden="true" />
                </button>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
                <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-medium text-background transition-transform active:scale-[0.97]"
                >
                    <GithubMark className="size-3.5" />
                    GitHub
                </a>
                <a
                    href={BILIBILI_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-[#FB7299] px-3 text-[12px] font-medium text-white transition-transform active:scale-[0.97]"
                >
                    <Tv className="size-3.5" aria-hidden="true" />
                    Bilibili
                </a>
            </div>
        </div>
    )
}

export { StarToast }
