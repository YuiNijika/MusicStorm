import { useEffect, useState } from "react"

import { fetchContributors, LICENSE_URL, REPO_URL } from "../../lib/github"
import type { Contributor } from "../../lib/github"
import { SplitText } from "../split-text/split-text"

import "./open-source.css"

function OpenSource() {
    const [contributors, setContributors] = useState<Contributor[]>([])

    useEffect(() => {
        let cancelled = false
        fetchContributors().then((list) => {
            if (!cancelled) {
                setContributors(list)
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <section className="open-source" id="open-source">
            <div className="open-source__inner">
                <SplitText
                    tag="h2"
                    className="display-lg open-source__title"
                    text="开源，共建。"
                    duration={0.8}
                    from={{ opacity: 0, y: 24 }}
                    to={{ opacity: 1, y: 0 }}
                />
                <p className="section-lead open-source__lead reveal">
                    MusicStorm 以 MIT 协议开源，代码完全公开。
                    欢迎 Star、提 Issue，或直接提交 PR 参与共建。
                </p>
                <div className="open-source__actions reveal">
                    <a
                        className="open-source__button"
                        href={REPO_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        访问 GitHub 仓库
                    </a>
                    <a
                        className="open-source__license"
                        href={LICENSE_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        MIT License
                    </a>
                </div>
                {contributors.length > 0 ? (
                    <div className="open-source__contributors">
                        <p className="open-source__contributors-label">
                            感谢以下贡献者
                        </p>
                        <ul className="open-source__contributors-list">
                            {contributors.map((c) => (
                                <li key={c.login}>
                                    <a
                                        href={c.profileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={c.login}
                                        aria-label={`贡献者 ${c.login}`}
                                    >
                                        <img
                                            src={c.avatarUrl}
                                            alt={c.login}
                                            loading="lazy"
                                        />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </section>
    )
}

export { OpenSource }
