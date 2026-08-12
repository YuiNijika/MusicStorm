import { useState } from "react"
import { Menu, X } from "lucide-react"

import type { SectionTarget } from "../../lib/scroll-to"
import { ThemeToggle } from "../theme-toggle/theme-toggle"

import "./site-header.css"

const NAV_LINKS: { label: string; target: SectionTarget }[] = [
    { label: "功能", target: "features" },
    { label: "截图", target: "screenshots" },
    { label: "下载", target: "download" },
]

/** 网页版入口：与 docs/ 同目录部署，相对路径兼容子路径 */
const WEB_PLAYER_URL = "player.html"

function SiteHeader({ onNavigate }: { onNavigate: (target: SectionTarget) => void }) {
    const [menuOpen, setMenuOpen] = useState(false)

    // 跳转后关闭移动端抽屉，避免遮罩残留
    const go = (target: SectionTarget) => {
        setMenuOpen(false)
        onNavigate(target)
    }

    return (
        <header className="site-header">
            <nav className="site-header__inner" aria-label="主导航">
                <button
                    type="button"
                    className="site-header__brand"
                    onClick={() => go("top")}
                >
                    <StormIcon />
                    <span>MusicStorm</span>
                </button>
                <ul className="site-header__links">
                    {NAV_LINKS.map((link) => (
                        <li key={link.target}>
                            <button
                                type="button"
                                onClick={() => go(link.target)}
                            >
                                {link.label}
                            </button>
                        </li>
                    ))}
                    <li>
                        <a href={WEB_PLAYER_URL}>网页版</a>
                    </li>
                    <li>
                        <a href="#/docs">文档</a>
                    </li>
                </ul>
                <button
                    type="button"
                    className="site-header__menu-toggle"
                    aria-expanded={menuOpen}
                    aria-label={menuOpen ? "关闭导航" : "打开导航"}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <ThemeToggle />
            </nav>

            {menuOpen ? (
                <div
                    className="site-header__drawer-backdrop"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                />
            ) : null}
            <div
                className={`site-header__drawer${menuOpen ? " is-open" : ""}`}
                aria-hidden={!menuOpen}
            >
                <ul>
                    {NAV_LINKS.map((link) => (
                        <li key={link.target}>
                            <button type="button" onClick={() => go(link.target)}>
                                {link.label}
                            </button>
                        </li>
                    ))}
                    <li>
                        <a href={WEB_PLAYER_URL} onClick={() => setMenuOpen(false)}>
                            网页版
                        </a>
                    </li>
                    <li>
                        <a href="#/docs" onClick={() => setMenuOpen(false)}>
                            文档
                        </a>
                    </li>
                </ul>
            </div>
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
