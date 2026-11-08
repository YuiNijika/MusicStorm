import { createElement, useMemo, type ReactNode } from "react"

import { safeWebUrl } from "@/lib/feedback/api"
import { openExternalUrl } from "@/lib/open-external"
import { isWebMode } from "@/lib/web-mode"

const ALLOWED_TAGS = new Set([
    "p", "div", "span", "section", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "del", "br", "hr",
    "blockquote", "pre", "code", "a", "img", "table", "thead", "tbody",
    "tr", "th", "td", "details", "summary",
])
const HIDDEN_TAGS = new Set(["script", "style", "iframe", "object", "embed", "template"])
const ALIGNMENTS = new Set(["left", "center", "right"])

function renderNode(node: Node, key: string, headingShift: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent
    }
    if (!(node instanceof Element) || HIDDEN_TAGS.has(node.localName)) {
        return null
    }
    const children = Array.from(node.childNodes, (child, index) =>
        renderNode(child, `${key}-${index}`, headingShift),
    )
    if (node.localName === "input" && node.getAttribute("type") === "checkbox") {
        return <input key={key} type="checkbox" checked={node.hasAttribute("checked")}
            disabled aria-label={node.parentElement?.textContent?.trim() || "任务"} />
    }
    if (!ALLOWED_TAGS.has(node.localName)) {
        return children
    }
    if (node.localName === "a") {
        const href = safeWebUrl(node.getAttribute("href"))
        if (!href) {
            return children
        }
        return <a key={key} href={href} target="_blank" rel="noopener noreferrer"
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
        return src ? <img key={key} src={src} alt={node.getAttribute("alt") ?? ""}
            width={640} height={360} loading="lazy" decoding="async"
            className="h-auto max-w-full rounded-lg" /> : null
    }
    if (node.localName === "table") {
        return <div key={key} className="safe-content-table overflow-x-auto" tabIndex={0}
            role="region" aria-label="内容表格"><table>{children}</table></div>
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
        ? `h${Math.min(Number(node.localName[1]) + headingShift, 6)}` : node.localName
    return createElement(tag, { key },
        ...(node.localName === "br" || node.localName === "hr" ? [] : children))
}

function SafeContent({ html, className, prefix, headingShift = 2 }: {
    html: string
    className?: string
    prefix?: ReactNode
    headingShift?: number
}) {
    const nodes = useMemo(() => {
        const document = new DOMParser().parseFromString(html, "text/html")
        return Array.from(document.body.childNodes).filter((node) =>
            node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()),
        )
    }, [html])
    return <div className={className}>
        {prefix ? (
            nodes.length > 0 && nodes[0] instanceof Element && nodes[0].localName === "p"
                ? <p key="content-prefix">{prefix}{" "}
                    {Array.from(nodes[0].childNodes, (child, childIndex) =>
                        renderNode(child, `0-${childIndex}`, headingShift))}
                </p>
                : <p>{prefix}</p>
        ) : null}
        {nodes.map((node, index) => {
            if (index === 0 && prefix && node instanceof Element && node.localName === "p") {
                return null
            }
            return renderNode(node, String(index), headingShift)
        })}
    </div>
}

export { SafeContent }
