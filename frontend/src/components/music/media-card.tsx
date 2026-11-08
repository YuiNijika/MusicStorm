import type { ReactNode } from "react"

import { Play } from "lucide-react"
import { memo } from "react"

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

const MediaCard = memo(function MediaCard({
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
                "group relative flex shrink-0 cursor-pointer flex-col gap-2.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                // 悬停上浮走 hover 时长，按下瞬间缩短到 press 时长——按压反馈必须先到位
                "transition-transform duration-[var(--duration-hover)] hover:-translate-y-0.5 active:scale-[0.98] active:duration-[var(--duration-press)]",
                widthClassName,
                className,
            )}
        >
            <div
                className={cn(
                    "apple-card-shadow relative overflow-hidden rounded-[14px] ring-1 ring-foreground/10",
                    "transition-shadow duration-[var(--duration-hover)]",
                    "group-hover:shadow-[var(--shadow-float)] group-hover:ring-foreground/15",
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
                {/* hover 播放键是纯装饰，点击仍走整卡；外部已注入覆盖层时不再重复叠加 */}
                {!overlay ? (
                    <span
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute bottom-2 right-2 z-[1] flex size-9 items-center justify-center rounded-full",
                            "bg-primary text-primary-foreground shadow-[var(--shadow-float)]",
                            "translate-y-1 opacity-0 transition-[opacity,transform] duration-[var(--duration-hover)] ease-[var(--ease-enter)]",
                            "group-hover:translate-y-0 group-hover:opacity-100",
                            "group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
                            active && "translate-y-0 opacity-100",
                        )}
                    >
                        <Play className="size-4 fill-current" />
                    </span>
                ) : null}
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
})

export { MediaCard }
