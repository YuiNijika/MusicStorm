import { LICENSE_URL, REPO_URL } from "../../lib/github"

import "./site-footer.css"

const CURRENT_YEAR = new Date().getFullYear()

function SiteFooter() {
    return (
        <footer className="site-footer">
            <div className="site-footer__inner">
                <span className="site-footer__copy">
                    © {CURRENT_YEAR} MusicStorm · 基于{" "}
                    <a
                        className="site-footer__link"
                        href={LICENSE_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        MIT 协议
                    </a>{" "}
                    开源
                </span>
                <a
                    className="site-footer__link"
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                >
                    GitHub
                </a>
            </div>
        </footer>
    )
}

export { SiteFooter }
