import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { isWebMode } from "@/lib/web-mode"

const BANNER_DISMISS_KEY = "musicstorm-web-download-banner-dismissed"

/**
 * 网页版顶部提示条：引导下载桌面端体验完整功能。
 * 关闭后持久化（localStorage），桌面版不渲染。
 */
function DownloadBanner() {
    const [visible, setVisible] = useState(() => {
        if (!isWebMode()) {
            return false
        }
        try {
            return window.localStorage.getItem(BANNER_DISMISS_KEY) !== "1"
        } catch {
            return true
        }
    })

    // 桌面版（Tauri 运行时）不挂载
    useEffect(() => {
        if (!isWebMode()) {
            setVisible(false)
        }
    }, [])

    if (!visible) {
        return null
    }

    function dismiss() {
        setVisible(false)
        try {
            window.localStorage.setItem(BANNER_DISMISS_KEY, "1")
        } catch {
            // 隐私模式等场景写入失败，仅本次隐藏
        }
    }

    return (
        <Alert
            role="note"
            className="download-banner rounded-none border-0 px-4 py-2.5"
        >
            <AlertDescription className="flex w-full max-w-[720px] items-center gap-2.5 justify-self-center py-0 text-[13px]">
                <span className="min-w-0 flex-1 leading-6">
                    网页版功能有限（仅在线播放与本地导入），下载桌面端可体验
                    本地高音质输出、系统托盘、全局快捷键等完整功能
                </span>
                <a
                    className="shrink-0 font-semibold text-accent underline-offset-3 transition-colors hover:text-accent/80 hover:underline"
                    href="https://github.com/YuiNijika/MusicStorm/releases/latest"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    下载桌面端
                </a>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="关闭提示"
                    className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground active:scale-95 dark:hover:bg-white/[0.1]"
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                    >
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>
            </AlertDescription>
        </Alert>
    )
}

export { DownloadBanner }
