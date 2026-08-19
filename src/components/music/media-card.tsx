import type { ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { cn } from "@/lib/utils"

type MediaCardProps = {
    coverUrl: string
    title: string
    subtitle?: string
    onClick?: () => void
    active?: boolean
    className?: string
    /** 固定宽度，横向滚动条用 */
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
                "group relative flex shrink-0 cursor-pointer flex-col gap-2.5 text-left outline-none",
                // 悬停上浮走 hover 时长，按下瞬间缩短到 press 时长——按压反馈必须先到位
                "transition-transform duration-[var(--duration-hover)] hover:-translate-y-0.5 active:scale-[0.98] active:duration-[var(--duration-press)]",
                widthClassName,
                className,
            )}
        >
            <div
                className={cn(
                    "apple-card-shadow relative overflow-hidden rounded-[14px] ring-1 ring-black/[0.06]",
                    "transition-shadow duration-[var(--duration-hover)]",
                    "group-hover:shadow-[0_14px_36px_rgba(15,23,42,0.14)] group-hover:ring-black/[0.14]",
                    "dark:ring-white/[0.08] dark:group-hover:shadow-[0_14px_36px_rgba(0,0,0,0.4)] dark:group-hover:ring-white/[0.16]",
                    active && "ring-2 ring-primary/70",
                )}
            >
                <Cover
                    src={coverUrl}
                    alt={title}
                    size="xl"
                    className="rounded-[14px] shadow-none transition-transform duration-[var(--duration-enter)] ease-[var(--ease-enter)] group-hover:scale-[1.02]"
                />
                {overlay}
            </div>
            <div className="w-full min-w-0 max-w-full px-0.5">
                <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground md:text-[13px]">
                    {title}
                </p>
                {subtitle ? (
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground md:text-[12px]">
                        {subtitle}
                    </p>
                ) : null}
            </div>
        </button>
    )
}

export { MediaCard }
