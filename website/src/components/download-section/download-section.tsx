import { RELEASES_URL } from "../../lib/github"
import { useLatestRelease } from "../../hooks/use-github"
import { ShinyText } from "../shiny-text/shiny-text"
import { StarBorder } from "../star-border/star-border"

import "./download-section.css"

function DownloadSection() {
    // 拉取失败（离线/限流）时 data 为 null，下载按钮退化为 Releases 列表页
    const { data: release, loading } = useLatestRelease()

    const windowsUrl = release?.url ?? RELEASES_URL

    return (
        <section className="download">
            <div className="download__inner reveal">
                <h2 className="display-lg download__title">
                    <ShinyText
                        text="现在就开始。"
                        color="var(--color-text)"
                        shineColor="var(--color-accent)"
                        speed={3}
                    />
                </h2>
                <p className="section-lead download__lead">
                    {release
                        ? `最新版本 v${release.version}，免费下载，即刻体验。`
                        : "免费下载，即刻体验。"}
                </p>
                <div className="download__actions">
                    <StarBorder
                        as="a"
                        href={windowsUrl}
                        target="_blank"
                        rel="noreferrer"
                        color="var(--color-accent)"
                        speed="5s"
                        className="download__star"
                    >
                        <span className="download__button-content">
                            <WindowsIcon />
                            <span className="download__button-text">
                                <span className="download__button-label">
                                    下载 Windows 版
                                </span>
                                {loading ? (
                                    <span
                                        className="skeleton download__version-skeleton"
                                        aria-hidden="true"
                                    />
                                ) : release ? (
                                    <span className="download__button-version">
                                        v{release.version}
                                    </span>
                                ) : null}
                            </span>
                        </span>
                    </StarBorder>
                    <span
                        className="download__button download__button--disabled"
                        aria-disabled="true"
                    >
                        <AppleIcon />
                        <span className="download__button-text">
                            <span className="download__button-label">macOS 版</span>
                            <span className="download__button-version">即将推出</span>
                        </span>
                    </span>
                    <span
                        className="download__button download__button--disabled"
                        aria-disabled="true"
                    >
                        <AndroidIcon />
                        <span className="download__button-text">
                            <span className="download__button-label">Android 版</span>
                            <span className="download__button-version">即将推出</span>
                        </span>
                    </span>
                </div>
            </div>
        </section>
    )
}

function WindowsIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 5.5 10.5 4.4v7.1H3V5.5Zm9 1.1L21 5.3v8.2h-9V6.6ZM3 12.9h7.5V20L3 18.9v-6Zm9 0h9v7.7l-9-1.3v-6.4Z" />
        </svg>
    )
}

function AppleIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.86-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.98-.2 1.92-.87 3.03-.83 1.32.11 2.31.63 2.96 1.58-2.73 1.63-2.27 5.22.45 6.22-.63 1.65-1.44 3.29-2.52 4.2ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
        </svg>
    )
}

function AndroidIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M7 9.5h10V18a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 18V9.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="M8.5 6.5a3.5 3.5 0 0 1 7 0v3h-7v-3Z"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="m8.8 3.6 1-1.2m5.4 1.2-1-1.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    )
}

export { DownloadSection }
