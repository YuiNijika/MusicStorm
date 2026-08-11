import { useEffect, useState } from "react"

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
        <div className="download-banner" role="note">
            <div className="download-banner__inner">
                <span className="download-banner__text">
                    网页版功能有限（仅在线播放与本地导入），下载桌面端可体验
                    本地高音质输出、系统托盘、全局快捷键等完整功能
                </span>
                <a
                    className="download-banner__link"
                    href="https://github.com/YuiNijika/MusicStorm/releases/latest"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    下载桌面端
                </a>
                <button
                    type="button"
                    className="download-banner__close"
                    onClick={dismiss}
                    aria-label="关闭提示"
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
            </div>
        </div>
    )
}

export { DownloadBanner }
