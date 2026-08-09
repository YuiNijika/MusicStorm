import { useReveal } from "./hooks/use-reveal"
import { SiteHeader } from "./components/site-header/site-header"
import { Hero } from "./components/hero/hero"
import { FeatureGrid } from "./components/feature-grid/feature-grid"
import { Screenshots } from "./components/screenshots/screenshots"
import { DownloadSection } from "./components/download-section/download-section"
import { OpenSource } from "./components/open-source/open-source"
import { SiteFooter } from "./components/site-footer/site-footer"

function App() {
    const rootRef = useReveal<HTMLDivElement>()

    return (
        <div ref={rootRef}>
            <SiteHeader />
            <main>
                <Hero />
                <FeatureGrid />
                <Screenshots />
                <DownloadSection />
                <OpenSource />
            </main>
            <SiteFooter />
        </div>
    )
}

export { App }
