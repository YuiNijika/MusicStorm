import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import plaintext from "highlight.js/lib/languages/plaintext"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import { marked } from "marked"

// 按需注册语言，避免整包体积；别名对应代码块常见写法
hljs.registerLanguage("bash", bash)
hljs.registerLanguage("css", css)
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("js", javascript)
hljs.registerLanguage("json", json)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("md", markdown)
hljs.registerLanguage("plaintext", plaintext)
hljs.registerLanguage("txt", plaintext)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("ts", typescript)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("html", xml)

const renderer = new marked.Renderer()

// 代码块构建期高亮：HTML 直接带 hljs token，运行时零开销、无闪烁
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
    const language = (lang ?? "").toLowerCase().trim()
    const highlighted = hljs.getLanguage(language)
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : hljs.highlight(text, { language: "plaintext" }).value
    const langClass = language || "plaintext"
    return `<pre class="doc-code"><code class="hljs language-${langClass}">${highlighted}</code></pre>`
}

marked.use({ renderer })

type DocMeta = {
    slug: string
    title: string
    description: string
    order: number
}

type Doc = DocMeta & {
    html: string
}

// 绝对路径模式；** 支持 dev/api 这类嵌套子目录文档
const rawFiles = import.meta.glob("/content/docs/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
}) as Record<string, string>

function parseFrontmatter(raw: string): {
    meta: Record<string, string>
    body: string
} {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
        return { meta: {}, body: raw }
    }
    const meta: Record<string, string> = {}
    for (const line of match[1].split(/\r?\n/)) {
        const sep = line.indexOf(":")
        if (sep <= 0) {
            continue
        }
        meta[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
    }
    return { meta, body: match[2] }
}

// h2/h3 补锚点 id，方便站内直达小节
function addHeadingAnchors(html: string): string {
    return html.replace(
        /<h([23])>([\s\S]*?)<\/h\1>/g,
        (whole, depth: string, inner: string) => {
            const text = inner
                .replace(/<[^>]+>/g, "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "-")
            if (!text) {
                return whole
            }
            return `<h${depth} id="${text}">${inner}</h${depth}>`
        },
    )
}

// 站外链接新窗口打开，不打断阅读位置
function relaxExternalLinks(html: string): string {
    return html.replace(
        /<a href="(https?:\/\/[^"]+)"/g,
        '<a target="_blank" rel="noopener noreferrer" href="$1"',
    )
}

function renderDoc(slug: string, raw: string): Doc {
    const { meta, body } = parseFrontmatter(raw)
    const html = relaxExternalLinks(
        addHeadingAnchors(marked.parse(body, { async: false })),
    )
    return {
        slug,
        title: meta.title || slug,
        description: meta.description || "",
        order: Number(meta.order) || 0,
        html,
    }
}

const docs: Doc[] = Object.entries(rawFiles)
    .map(([path, raw]) => {
        // slug 保留相对 content/docs/ 的相对路径，支持 dev/api 这类嵌套文档
        const slug = path
            .replace(/^.*\/content\/docs\//, "")
            .replace(/\.md$/, "")
        return renderDoc(slug, raw)
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-CN"))

function getDocs(): DocMeta[] {
    return docs.map(({ html: _html, ...meta }) => meta)
}

function getDoc(slug: string): Doc | null {
    return docs.find((doc) => doc.slug === slug) ?? null
}

export { getDoc, getDocs }
export type { Doc, DocMeta }
