import { useMemo, type ReactNode } from "react"
import { Marked } from "marked"

import { SafeContent } from "@/components/safe-content"

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

function Content({ content, prefix }: { content: string; prefix?: ReactNode }) {
    const html = useMemo(() => parser.parse(content) as string, [content])
    return <SafeContent html={html} className="feedback-comment-content" prefix={prefix}
        headingShift={2} />
}

export { Content }
