import { createElement, useMemo, type ReactNode } from "react"
import { Marked } from "marked"

import { safeWebUrl } from "@/lib/feedback/api"
import { openExternalUrl } from "@/lib/open-external"
import { isWebMode } from "@/lib/web-mode"

const parser = new Marked({
    async: false,
    breaks: true,
    gfm: true,
    renderer: {
        html({ text }) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        },
    },
})
const CONTENT_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
    "strong", "em", "del", "br", "hr", "blockquote", "pre", "code",
    "a", "img", "table", "thead", "tbody", "tr", "th", "td",
])
const ALIGNMENTS = new Set(["left", "center", "right"])

function renderNode(node: Node, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent
    }
    if (!(node instanceof Element)) {
        return null
    }
    const children = Array.from(node.childNodes, (child, index) => renderNode(child, `${key}-${index}`))
    if (node.localName === "input" && node.getAttribute("type") === "checkbox") {
        return <input key={key} type="checkbox" checked={node.hasAttribute("checked")}
            disabled aria-label={node.parentElement?.textContent?.trim() || "任务"} />
    }
    if (!CONTENT_TAGS.has(node.localName)) {
        return null
    }
    // 仅映射受信任的内容属性以免评论改变页面或执行脚本
    if (node.localName === "a") {
        const href = safeWebUrl(node.getAttribute("href"))
        if (!href) {
            return children
        }
        return <a key={key} href={href} title={node.getAttribute("title") ?? undefined}
            target="_blank" rel="noopener noreferrer"
            onClick={(event) => {
                if (isWebMode()) {
                    return
                }
                event.preventDefault()
                void openExternalUrl(href)
            }}>{children}</a>
    }
    if (node.localName === "img") {
        const src = safeWebUrl(node.getAttribute("src"))
        const alt = node.getAttribute("alt") ?? ""
        return src ? <img key={key} src={src} alt={alt} width={640} height={360}
            loading="lazy" decoding="async" /> : alt
    }
    if (node.localName === "table") {
        return <div key={key} className="feedback-markdown-table" tabIndex={0}
            role="region" aria-label="评论表格"><table>{children}</table></div>
    }
    if (node.localName === "ol") {
        const start = Number(node.getAttribute("start") ?? 1)
        return <ol key={key} start={Number.isSafeInteger(start) ? start : undefined}>{children}</ol>
    }
    if (node.localName === "th" || node.localName === "td") {
        const align = node.getAttribute("align") ?? ""
        return createElement(node.localName, {
            key,
            style: ALIGNMENTS.has(align) ? { textAlign: align } : undefined,
        }, children)
    }
    if (node.localName === "pre") {
        return <pre key={key} tabIndex={0} aria-label="代码块">{children}</pre>
    }
    const tag = /^h[1-6]$/.test(node.localName)
        ? `h${Math.min(Number(node.localName[1]) + 2, 6)}` : node.localName
    return createElement(tag, { key },
        ...(node.localName === "br" || node.localName === "hr" ? [] : children))
}

function Content({ content, prefix }: { content: string; prefix?: ReactNode }) {
    const nodes = useMemo(() => {
        const html = parser.parse(content) as string
        const document = new DOMParser().parseFromString(html, "text/html")
        return Array.from(document.body.childNodes).filter((node) =>
            node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()),
        )
    }, [content])

    return <div className="feedback-comment-content">
        {prefix && !(nodes[0] instanceof Element && nodes[0].localName === "p")
            ? <p>{prefix}</p> : null}
        {nodes.map((node, index) => {
            if (index === 0 && prefix && node instanceof Element && node.localName === "p") {
                return <p key={index}>{prefix}{" "}
                    {Array.from(node.childNodes, (child, childIndex) => renderNode(child, `0-${childIndex}`))}
                </p>
            }
            return renderNode(node, String(index))
        })}
    </div>
}

export { Content }
