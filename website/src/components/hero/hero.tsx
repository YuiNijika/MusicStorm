import { GradientText } from "../gradient-text/gradient-text"
import { ScrollExpand } from "../scroll-expand/scroll-expand"
import { scrollToSection } from "../../lib/scroll-to"

import "./hero.css"

function Hero() {
    return (
        <section className="hero">
            <ScrollExpand
                src="/image/hero.webp"
                alt="MusicStorm 应用主界面"
                title="让每一次聆听，都成为风暴"
                scrollHint="向下滚动"
                useWindowScroll
            >
                <div className="hero__card">
                    <GradientText
                        className="hero__brand"
                        colors={["#0a84ff", "#bf5af2", "#ff375f"]}
                        animationSpeed={6}
                    >
                        MusicStorm
                    </GradientText>
                    <p className="hero__lead">
                        本地曲库与云端音乐合二为一，歌词、主题、全屏播放，
                        为你重新设计的音乐体验。
                    </p>
                    <div className="hero__actions">
                        <button
                            type="button"
                            className="hero__button hero__button--primary"
                            onClick={() => scrollToSection("download")}
                        >
                            免费下载
                        </button>
                        <button
                            type="button"
                            className="hero__button hero__button--link"
                            onClick={() => scrollToSection("features")}
                        >
                            了解更多
                        </button>
                    </div>
                </div>
            </ScrollExpand>
        </section>
    )
}

export { Hero }
