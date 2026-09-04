import { memo } from "react"

import type { MusicSource } from "@/lib/types"
import { cn } from "@/lib/utils"

const LABELS: Record<MusicSource, string> = {
    local: "本地",
    netease: "网易云",
}

type SourceBadgeProps = {
    source: MusicSource
    className?: string
}

// memo：source/className 稳定 props，高频父重渲（200ms tick）时跳过
const SourceBadge = memo(function SourceBadge({ source, className }: SourceBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none tracking-[0.02em]",
                source === "netease"
                    ? "bg-rose-500/12 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300"
                    : "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
                className,
            )}
        >
            {LABELS[source]}
        </span>
    )
})

export { SourceBadge }