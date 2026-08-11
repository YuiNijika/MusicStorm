import { useEffect, useState } from "react"
import { ChevronDown, Search } from "lucide-react"

import { getDoc, getDocs, type DocMeta } from "../../lib/docs"

import "./docs-page.css"

type DocsPageProps = {
    slug: string | null
}

// 侧边栏分组：slug 无 "/" 为顶层文档（组标题），带 "/" 的归入其父组
type NavGroup = {
    item: DocMeta
    children: DocMeta[]
}

function buildNavGroups(docs: DocMeta[]): NavGroup[] {
    const groups: NavGroup[] = []
    const bySlug = new Map<string, NavGroup>()
    for (const item of docs) {
        if (!item.slug.includes("/")) {
            const group = { item, children: [] }
            groups.push(group)
            bySlug.set(item.slug, group)
        }
    }
    for (const item of docs) {
        if (!item.slug.includes("/")) {
            continue
        }
        const parent = item.slug.split("/")[0]
        bySlug.get(parent)?.children.push(item)
    }
    return groups
}

function DocsPage({ slug }: DocsPageProps) {
    const docs = getDocs()
    const doc = slug ? getDoc(slug) : null
    const groups = buildNavGroups(docs)

    // 默认展开当前文档所在组，导航时自动跟随
    const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
        const initial = new Set<string>()
        if (doc?.slug.includes("/")) {
            initial.add(doc.slug.split("/")[0])
        }
        return initial
    })

    useEffect(() => {
        if (doc?.slug.includes("/")) {
            const parent = doc.slug.split("/")[0]
            setOpenGroups((prev) =>
                prev.has(parent) ? prev : new Set(prev).add(parent),
            )
        }
    }, [doc?.slug])

    const toggleGroup = (parentSlug: string) => {
        setOpenGroups((prev) => {
            const next = new Set(prev)
            if (next.has(parentSlug)) {
                next.delete(parentSlug)
            } else {
                next.add(parentSlug)
            }
            return next
        })
    }

    return (
        <main className="docs">
            <div className="docs__inner">
                <aside className="docs__sidebar">
                    <p className="docs__sidebar-title">文档</p>
                    <nav aria-label="文档目录">
                        <ul className="docs__nav">
                            {groups.map((group) => {
                                const open = openGroups.has(group.item.slug)
                                const hasChildren = group.children.length > 0
                                const inGroup =
                                    doc?.slug === group.item.slug ||
                                    doc?.slug.startsWith(
                                        `${group.item.slug}/`,
                                    )
                                return (
                                    <li key={group.item.slug}>
                                        <div className="docs__nav-group">
                                            <a
                                                href={`#/docs/${group.item.slug}`}
                                                className={
                                                    inGroup
                                                        ? "is-active"
                                                        : undefined
                                                }
                                                aria-current={
                                                    doc?.slug ===
                                                    group.item.slug
                                                        ? "page"
                                                        : undefined
                                                }
                                            >
                                                {group.item.title}
                                            </a>
                                            {hasChildren ? (
                                                <button
                                                    type="button"
                                                    className="docs__nav-toggle"
                                                    onClick={() =>
                                                        toggleGroup(
                                                            group.item.slug,
                                                        )
                                                    }
                                                    aria-expanded={open}
                                                    aria-label={`${open ? "收起" : "展开"} ${group.item.title}`}
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                            ) : null}
                                        </div>
                                        {hasChildren && open ? (
                                            <ul className="docs__nav-children">
                                                {group.children.map((child) => (
                                                    <li key={child.slug}>
                                                        <a
                                                            href={`#/docs/${child.slug}`}
                                                            aria-current={
                                                                doc?.slug ===
                                                                child.slug
                                                                    ? "page"
                                                                    : undefined
                                                            }
                                                        >
                                                            {child.title}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                    </li>
                                )
                            })}
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
    const [query, setQuery] = useState("")

    // 标题 + 描述关键词过滤，不匹配时给空态而非空白页
    const keyword = query.trim().toLowerCase()
    const filtered = keyword
        ? docs.filter(
              (item) =>
                  item.title.toLowerCase().includes(keyword) ||
                  item.description.toLowerCase().includes(keyword),
          )
        : docs

    return (
        <div className="docs__index">
            <p className="docs__eyebrow">文档</p>
            <h1 className="docs__title">使用指南</h1>
            <p className="docs__lead">
                从下载安装到曲库管理，这里有使用 MusicStorm 需要知道的一切。
            </p>
            <label className="docs__search">
                <Search className="docs__search-icon" size={16} aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索文档…"
                    aria-label="搜索文档"
                />
            </label>
            {filtered.length > 0 ? (
                <div className="docs__cards">
                    {filtered.map((item) => (
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
            ) : (
                <p className="docs__empty">没有匹配「{query}」的文档</p>
            )}
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
