import { useEffect, useState } from "react"

import { fetchLatestRelease, RELEASES_URL } from "../../lib/github"
import type { ReleaseInfo } from "../../lib/github"
import { ShinyText } from "../shiny-text/shiny-text"
import { StarBorder } from "../star-border/star-border"

import "./download-section.css"

function DownloadSection() {
    // 拉取失败（离线/限流）时保持 null，下载按钮退化为 Releases 列表页
    const [release, setRelease] = useState<ReleaseInfo | null>(null)

    useEffect(() => {
        let cancelled = false
        fetchLatestRelease().then((info) => {
            if (!cancelled) {
                setRelease(info)
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    const windowsUrl = release?.url ?? RELEASES_URL

    return (
        <section className="download" id="download">
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
                                {release ? (
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
