type SectionTarget =
    | "top"
    | "features"
    | "screenshots"
    | "download"
    | "open-source"

const SECTION_CLASS: Record<SectionTarget, string> = {
    top: "hero",
    features: "feature-grid",
    screenshots: "screenshots",
    download: "download",
    "open-source": "open-source",
}

function scrollToSection(target: SectionTarget): void {
    document
        .querySelector(`.${SECTION_CLASS[target]}`)
        ?.scrollIntoView({ behavior: "smooth" })
}

export { scrollToSection }
export type { SectionTarget }
