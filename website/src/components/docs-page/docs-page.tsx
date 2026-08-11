import { getDoc, getDocs } from "../../lib/docs"

import "./docs-page.css"

type DocsPageProps = {
    slug: string | null
}

function DocsPage({ slug }: DocsPageProps) {
    const docs = getDocs()
    const doc = slug ? getDoc(slug) : null

    return (
        <main className="docs">
            <div className="docs__inner">
                <aside className="docs__sidebar">
                    <p className="docs__sidebar-title">文档</p>
                    <nav aria-label="文档目录">
                        <ul className="docs__nav">
                            {docs.map((item) => (
                                <li key={item.slug}>
                                    <a
                                        href={`#/docs/${item.slug}`}
                                        aria-current={
                                            doc?.slug === item.slug
                                                ? "page"
                                                : undefined
                                        }
                                    >
                                        {item.title}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </aside>

                <div className="docs__body">
                    {doc ? (
                        <DocArticle slug={doc.slug} />
                    ) : (
                        <DocIndex />
                    )}
                </div>
            </div>
        </main>
    )
}

function DocIndex() {
    const docs = getDocs()
    return (
        <div className="docs__index">
            <p className="docs__eyebrow">文档</p>
            <h1 className="docs__title">使用指南</h1>
            <p className="docs__lead">
                从下载安装到曲库管理，这里有使用 MusicStorm 需要知道的一切。
            </p>
            <div className="docs__cards">
                {docs.map((item) => (
                    <a
                        key={item.slug}
                        className="docs__card"
                        href={`#/docs/${item.slug}`}
                    >
                        <span className="docs__card-title">{item.title}</span>
                        {item.description ? (
                            <span className="docs__card-desc">
                                {item.description}
                            </span>
                        ) : null}
                    </a>
                ))}
            </div>
        </div>
    )
}

function DocArticle({ slug }: { slug: string }) {
    const docs = getDocs()
    const doc = getDoc(slug)
    if (!doc) {
        return <DocIndex />
    }
    const index = docs.findIndex((item) => item.slug === slug)
    const prev = index > 0 ? docs[index - 1] : null
    const next = index < docs.length - 1 ? docs[index + 1] : null

    return (
        <article className="docs__article">
            <p className="docs__eyebrow">文档</p>
            <h1 className="docs__title">{doc.title}</h1>
            {doc.description ? (
                <p className="docs__lead">{doc.description}</p>
            ) : null}
            <div
                className="doc-content"
                // 内容为仓库内自有 markdown，构建期渲染，无注入面
                dangerouslySetInnerHTML={{ __html: doc.html }}
            />
            <nav className="docs__pager" aria-label="上一篇 / 下一篇">
                {prev ? (
                    <a href={`#/docs/${prev.slug}`} rel="prev">
                        <span className="docs__pager-hint">上一篇</span>
                        <span className="docs__pager-title">{prev.title}</span>
                    </a>
                ) : (
                    <span />
                )}
                {next ? (
                    <a href={`#/docs/${next.slug}`} rel="next">
                        <span className="docs__pager-hint">下一篇</span>
                        <span className="docs__pager-title">{next.title}</span>
                    </a>
                ) : (
                    <span />
                )}
            </nav>
        </article>
    )
}

export { DocsPage }
