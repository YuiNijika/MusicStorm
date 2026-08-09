import type { ReactNode } from "react"

import { SplitText } from "../split-text/split-text"
import { SpotlightCard } from "../spotlight-card/spotlight-card"

import "./feature-grid.css"

interface Feature {
    icon: ReactNode
    title: string
    description: string
}

const FEATURES: Feature[] = [
    {
        icon: <LibraryIcon />,
        title: "本地音乐库",
        description: "自动扫描本机歌曲，按艺人与专辑智能分组，封面歌词一应俱全。",
    },
    {
        icon: <CloudIcon />,
        title: "云端歌单随身",
        description: "登录网易云账号，收藏歌单与每日推荐即刻同步到播放器里。",
    },
    {
        icon: <LyricsIcon />,
        title: "沉浸式歌词",
        description: "逐行高亮的歌词视图，全屏之下，每一句都清晰可见。",
    },
    {
        icon: <PaletteIcon />,
        title: "调色板主题",
        description: "从专辑封面提取色彩，整个界面随正在播放的音乐而变换。",
    },
    {
        icon: <ExpandIcon />,
        title: "全屏播放",
        description: "封面与歌词两种布局自由切换，让音乐铺满整块屏幕。",
    },
    {
        icon: <DevicesIcon />,
        title: "跨平台",
        description: "Windows 开箱即用，Android、macOS 版本正在路上，音乐不止于桌面。",
    },
]

function FeatureGrid() {
    return (
        <section className="feature-grid" id="features">
            <div className="feature-grid__inner">
                {/* SplitText 渲染为 inline-block，外层 div 负责居中与间距 */}
                <div className="feature-grid__title">
                    <SplitText
                        tag="h2"
                        className="display-lg"
                        text="你想要的样子，它都有。"
                        duration={0.8}
                        from={{ opacity: 0, y: 24 }}
                        to={{ opacity: 1, y: 0 }}
                    />
                </div>
                <div className="feature-grid__cards">
                    {FEATURES.map((feature) => (
                        <SpotlightCard
                            className="feature-card reveal"
                            key={feature.title}
                        >
                            <div className="feature-card__icon" aria-hidden="true">
                                {feature.icon}
                            </div>
                            <h3 className="feature-card__title">{feature.title}</h3>
                            <p className="feature-card__description">
                                {feature.description}
                            </p>
                        </SpotlightCard>
                    ))}
                </div>
            </div>
        </section>
    )
}

function LibraryIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="14" y="15" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    )
}

function CloudIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
                d="M7 18a4.5 4.5 0 1 1 .6-8.96A5.5 5.5 0 0 1 18.3 10.4 3.75 3.75 0 0 1 17.5 18H7Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function LyricsIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M4 12h10M4 17h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    )
}

function PaletteIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
                d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.8-.6-1.3-.6-2.1 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8.6-9-8.6Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" />
            <circle cx="11" cy="7.5" r="1.2" fill="currentColor" />
            <circle cx="15" cy="8.5" r="1.2" fill="currentColor" />
        </svg>
    )
}

function ExpandIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
                d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function DevicesIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="2.5" y="5" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="17.5" y="9" width="4" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6 19h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    )
}

export { FeatureGrid }
