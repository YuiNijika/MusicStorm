import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { useIsMobile } from "@/hooks/use-mobile"
import { isWebMode } from "@/lib/web-mode"

const BANNER_DISMISS_KEY = "musicstorm-web-download-banner-dismissed"
const BANNER_TEXT =
    "网页版功能有限（仅在线播放与本地导入），下载桌面端可体验本地高音质输出、系统托盘、全局快捷键等完整功能"

/**
 * 网页版顶部提示条：引导下载桌面端体验完整功能。
 * 关闭后持久化（localStorage），桌面版不渲染。
 * 移动端长文案改走马灯（走马灯）滚动单行，避免与下载/关闭挤在一行错位。
 */
function DownloadBanner() {
    const isMobile = useIsMobile()
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
            className="download-banner overflow-hidden rounded-none border-0 px-4 py-0"
        >
            {isMobile ? (
                <div className="flex h-9 w-full items-center gap-2">
                    <div
                        className="download-marquee-track relative min-w-0 flex-1 overflow-hidden"
                        title={BANNER_TEXT}
                    >
                        <div className="download-marquee">
                            <span className="download-marquee-seg">
                                {BANNER_TEXT} ·{"\u00a0"}
                            </span>
                            <span
                                className="download-marquee-seg"
                                aria-hidden
                            >
                                {BANNER_TEXT} ·{"\u00a0"}
                            </span>
                        </div>
                    </div>
                    <a
                        className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-primary underline-offset-3"
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
                        className="grid size-7 shrink-0 place-items-center rounded-full text-foreground/60 transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-95 active:duration-[var(--duration-press)]"
                    >
                        <CloseIcon />
                    </button>
                </div>
            ) : (
                <AlertDescription className="flex w-full items-center justify-center gap-2.5 py-0 text-[13px] font-medium tracking-[0.01em] text-foreground">
                    <span className="min-w-0 leading-6 text-foreground/80">
                        {BANNER_TEXT}
                    </span>
                    <a
                        className="shrink-0 font-semibold text-primary underline-offset-3 transition-colors hover:text-primary/75 hover:underline"
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
                        className="grid size-6 shrink-0 place-items-center rounded-full text-foreground/60 transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-95 active:duration-[var(--duration-press)]"
                    >
                        <CloseIcon />
                    </button>
                </AlertDescription>
            )}
        </Alert>
    )
}

function CloseIcon() {
    return (
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
    )
}

export { DownloadBanner }
