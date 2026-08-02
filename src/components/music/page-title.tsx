import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** 页级标题：与资料库 Section 同量级，避免 34px 过重 */
type PageTitleProps = {
    title: string
    subtitle?: string
    trailing?: ReactNode
    className?: string
}

function PageTitle({ title, subtitle, trailing, className }: PageTitleProps) {
    return (
        <header
            className={cn(
                "flex items-end justify-between gap-4 border-b border-[var(--separator)] pb-4",
                className,
            )}
        >
            <div className="min-w-0 space-y-0.5">
                <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
                    {title}
                </h1>
                {subtitle ? (
                    <p className="truncate text-[13px] text-muted-foreground">
                        {subtitle}
                    </p>
                ) : null}
            </div>
            {trailing ? (
                <div className="flex shrink-0 items-center gap-2">{trailing}</div>
            ) : null}
        </header>
    )
}

export { PageTitle }