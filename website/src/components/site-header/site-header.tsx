import type { SectionTarget } from "../../lib/scroll-to"
import { ThemeToggle } from "../theme-toggle/theme-toggle"

import "./site-header.css"

const NAV_LINKS: { label: string; target: SectionTarget }[] = [
    { label: "功能", target: "features" },
    { label: "截图", target: "screenshots" },
    { label: "下载", target: "download" },
]

function SiteHeader({ onNavigate }: { onNavigate: (target: SectionTarget) => void }) {
    return (
        <header className="site-header">
            <nav className="site-header__inner" aria-label="主导航">
                <button
                    type="button"
                    className="site-header__brand"
                    onClick={() => onNavigate("top")}
                >
                    <StormIcon />
                    <span>MusicStorm</span>
                </button>
                <ul className="site-header__links">
                    {NAV_LINKS.map((link) => (
                        <li key={link.target}>
                            <button
                                type="button"
                                onClick={() => onNavigate(link.target)}
                            >
                                {link.label}
                            </button>
                        </li>
                    ))}
                    <li>
                        <a href="#/docs">文档</a>
                    </li>
                </ul>
                <ThemeToggle />
                {/* <a className="site-header__cta" href="https://github.com/YuiNijika/MusicStorm" target="_blank" rel="noopener noreferrer">
                    GitHub
                </a> */}
            </nav>
        </header>
    )
}

function StormIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M9 18V6l10-2v11.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
            <circle cx="16.5" cy="15.5" r="2.5" fill="currentColor" />
        </svg>
    )
}

export { SiteHeader }
