import type { ReactNode } from "react"
import {
    AlignLeft,
    Cloud,
    Library,
    Maximize,
    MonitorSmartphone,
    Palette,
} from "lucide-react"

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
        <section className="feature-grid">
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

// lucide 图标统一 28px / 1.8 描边，保持原手绘图标的视觉重量
const ICON_PROPS = { size: 28, strokeWidth: 1.8 } as const

function LibraryIcon() {
    return <Library {...ICON_PROPS} />
}

function CloudIcon() {
    return <Cloud {...ICON_PROPS} />
}

function LyricsIcon() {
    return <AlignLeft {...ICON_PROPS} />
}

function PaletteIcon() {
    return <Palette {...ICON_PROPS} />
}

function ExpandIcon() {
    return <Maximize {...ICON_PROPS} />
}

function DevicesIcon() {
    return <MonitorSmartphone {...ICON_PROPS} />
}

export { FeatureGrid }
