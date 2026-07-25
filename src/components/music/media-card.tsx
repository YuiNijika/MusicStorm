import type { ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { cn } from "@/lib/utils"

/** Apple Music 专辑/歌单卡片：封面主导 + 两行文案 */
type MediaCardProps = {
    coverUrl: string
    title: string
    subtitle?: string
    onClick?: () => void
    active?: boolean
    className?: string
    /** 固定宽度（横向滚动条用） */
    widthClassName?: string
    overlay?: ReactNode
}

function MediaCard({
    coverUrl,
    title,
    subtitle,
    onClick,
    active = false,
    className,
    widthClassName = "w-[148px]",
    overlay,
}: MediaCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "group relative flex shrink-0 cursor-pointer flex-col gap-2 text-left outline-none",
                "transition-transform duration-200 ease-out active:scale-[0.97]",
                widthClassName,
                className,
            )}
        >
            <div
                className={cn(
                    "relative overflow-hidden rounded-[12px]",
                    "shadow-[0_8px_28px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.04]",
                    "dark:shadow-[0_10px_32px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]",
                    active && "ring-2 ring-primary/70",
                )}
            >
                <Cover
                    src={coverUrl}
                    alt={title}
                    size="xl"
                    className="rounded-[12px] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
                {overlay}
            </div>
            <div className="min-w-0 px-0.5">
                <p className="truncate text-[13px] font-semibold tracking-[-0.02em] text-foreground">
                    {title}
                </p>
                {subtitle ? (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</p>
                ) : null}
            </div>
        </button>
    )
}

export { MediaCard }