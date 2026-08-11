import { useCallback, useEffect } from "react"

import { scrollToSection, type SectionTarget } from "./lib/scroll-to"
import { useHashRoute } from "./hooks/use-hash-route"
import { useReveal } from "./hooks/use-reveal"
import { SiteHeader } from "./components/site-header/site-header"
import { Hero } from "./components/hero/hero"
import { FeatureGrid } from "./components/feature-grid/feature-grid"
import { Screenshots } from "./components/screenshots/screenshots"
import { DownloadSection } from "./components/download-section/download-section"
import { OpenSource } from "./components/open-source/open-source"
import { DocsPage } from "./components/docs-page/docs-page"
import { SiteFooter } from "./components/site-footer/site-footer"

function App() {
    const rootRef = useReveal<HTMLDivElement>()
    const route = useHashRoute()

    // 首帧 commit 后淡出移除启动动画（index.html 内联 #boot-loading 兜底首帧，避免遮住页面）
    useEffect(() => {
        const boot = document.getElementById("boot-loading")
        if (!boot) return
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        const duration = reduce ? 0 : 260
        boot.style.transition = `opacity ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`
        boot.style.opacity = "0"
        boot.style.pointerEvents = "none"
        const timer = window.setTimeout(() => boot.remove(), duration + 80)
        return () => window.clearTimeout(timer)
    }, [])

    useEffect(() => {
        if (route.page === "docs") {
            // 进文档页/切文档始终回到顶部，阅读位置不留存
            window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
        }
    }, [route])

    // 首页导航：当前在文档页时先回首页，等首页挂载后再滚动到目标区块
    const handleNavigate = useCallback(
        (target: SectionTarget) => {
            if (route.page === "docs") {
                if (window.location.hash) {
                    window.location.hash = ""
                }
                window.setTimeout(() => scrollToSection(target), 80)
                return
            }
            scrollToSection(target)
        },
        [route.page],
    )

    return (
        <div ref={rootRef}>
            <SiteHeader onNavigate={handleNavigate} />
            {route.page === "docs" ? (
                <DocsPage slug={route.slug} />
            ) : (
                <main>
                    <Hero />
                    <FeatureGrid />
                    <Screenshots />
                    <DownloadSection />
                    <OpenSource />
                </main>
            )}
            <SiteFooter />
        </div>
    )
}

export { App }
