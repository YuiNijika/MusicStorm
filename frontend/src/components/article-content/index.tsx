import { SafeContent } from "@/components/safe-content"

function ArticleContent({ content }: { content: string }) {
    return (
        <SafeContent html={content} className="min-w-0 break-words text-sm leading-relaxed
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
            [&_.safe-content-table]:overflow-x-auto [&_td]:p-2 [&_th]:p-2
            [&_summary]:cursor-pointer [&_summary]:py-2 [&_summary:focus-visible]:outline-2"
            headingShift={1} />
    )
}

export { ArticleContent }
