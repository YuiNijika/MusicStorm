import { createElement, useMemo, type ReactNode } from "react"

import { safeWebUrl } from "@/lib/feedback/api"
import { openExternalUrl } from "@/lib/open-external"

const CONTENT_TAGS = new Set([
    "p", "div", "span", "section", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "strong", "em", "b", "i", "u", "s", "del", "br", "hr",
    "blockquote", "pre", "code", "a", "img", "table", "thead", "tbody",
    "tr", "th", "td", "details", "summary",
])
const HIDDEN_TAGS = new Set(["script", "style", "iframe", "object", "embed", "template"])

function renderNode(node: Node, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent
    }
    if (!(node instanceof Element) || HIDDEN_TAGS.has(node.localName)) {
        return null
    }
    const children = Array.from(node.childNodes, (child, index) =>
        renderNode(child, `${key}-${index}`),
    )
    if (!CONTENT_TAGS.has(node.localName)) {
        return children
    }
    // 只映射内容属性以免远程样式和事件影响应用界面
    if (node.localName === "a") {
        const href = safeWebUrl(node.getAttribute("href"))
        return <a key={key} href={href} target="_blank" rel="noopener noreferrer"
            onClick={href ? (event) => { event.preventDefault(); void openExternalUrl(href) } : undefined}
        >{children}</a>
    }
    if (node.localName === "img") {
        const src = safeWebUrl(node.getAttribute("src"))
        return src ? <img key={key} src={src} alt={node.getAttribute("alt") ?? ""}
            width={640} height={360} loading="lazy" className="h-auto max-w-full rounded-lg" /> : null
    }
    const tag = node.localName === "h1" ? "h2" : node.localName
    return createElement(tag, { key }, ...(tag === "br" || tag === "hr" ? [] : children))
}

function ArticleContent({ content }: { content: string }) {
    const nodes = useMemo(() => {
        const document = new DOMParser().parseFromString(content, "text/html")
        return Array.from(document.body.childNodes, (node, index) =>
            renderNode(node, String(index)),
        )
    }, [content])

    return (
        <article className="min-w-0 break-words text-sm leading-relaxed
            [&_p]:my-2 [&_li]:py-3 [&_li]:border-b [&_li]:border-[var(--separator)]
            [&_li:last-child]:border-0 [&_li>p:first-child]:font-medium
            [&_li>p:not(:first-child)]:text-muted-foreground
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ul_ul]:list-disc [&_ul_ul]:pl-5
            [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold
            [&_h3]:mt-4 [&_h3]:font-semibold [&_h4]:font-medium
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4
            [&_a]:rounded-sm [&_a:focus-visible]:outline-2
            [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground
            [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3
            [&_table]:block [&_table]:overflow-x-auto [&_td]:p-2 [&_th]:p-2
            [&_summary]:cursor-pointer [&_summary]:py-2 [&_summary:focus-visible]:outline-2">
            {nodes}
        </article>
    )
}

export { ArticleContent }
