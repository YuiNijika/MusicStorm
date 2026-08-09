import "./site-header.css"

const NAV_LINKS = [
    { label: "功能", href: "#features" },
    { label: "截图", href: "#screenshots" },
    { label: "下载", href: "#download" },
] as const

function SiteHeader() {
    return (
        <header className="site-header">
            <nav className="site-header__inner" aria-label="主导航">
                <a className="site-header__brand" href="#top">
                    <StormIcon />
                    <span>MusicStorm</span>
                </a>
                <ul className="site-header__links">
                    {NAV_LINKS.map((link) => (
                        <li key={link.href}>
                            <a href={link.href}>{link.label}</a>
                        </li>
                    ))}
                </ul>
                <a className="site-header__cta" href="https://space.bilibili.com/435502585" target="_blank" rel="noopener noreferrer">
                    联系作者
                </a>
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
