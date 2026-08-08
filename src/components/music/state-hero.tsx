import type { LucideIcon } from "lucide-react"
import {
    AlertCircle,
    FolderOpen,
    Inbox,
    LogIn,
    Music2,
    SearchX,
    WifiOff,
} from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type StateHeroVariant = "error" | "empty" | "offline" | "auth" | "search"

type StateHeroProps = {
    variant?: StateHeroVariant
    title: string
    description?: string
    action?: ReactNode
    className?: string
    /** 覆盖默认图标 */
    icon?: LucideIcon
}

const VARIANT_ICON: Record<StateHeroVariant, LucideIcon> = {
    error: AlertCircle,
    empty: Inbox,
    offline: WifiOff,
    auth: LogIn,
    search: SearchX,
}

// Apple 风格状态区：居中大留白 + 轻材质卡片，不用页面级大标题
function StateHero({
    variant = "empty",
    title,
    description,
    action,
    className,
    icon: IconProp,
}: StateHeroProps) {
    const Icon = IconProp ?? VARIANT_ICON[variant]
    const isError = variant === "error" || variant === "offline"

    return (
        <div
            role={isError ? "alert" : "status"}
            className={cn(
                "material-panel flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-[20px] px-8 py-14 text-center",
                className,
            )}
        >
            <div
                className={cn(
                    "flex size-14 items-center justify-center rounded-full",
                    isError
                        ? "bg-destructive/10 text-destructive"
                        : "bg-black/[0.05] text-muted-foreground dark:bg-white/[0.08]",
                )}
            >
                <Icon className="size-6" strokeWidth={1.75} />
            </div>
            <div className="max-w-sm space-y-1.5">
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                    {title}
                </p>
                {description ? (
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {action ? <div className="pt-1">{action}</div> : null}
        </div>
    )
}

function HeroRetryButton({
    onClick,
    children = "重试",
}: {
    onClick: () => void
    children?: ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform active:scale-[0.98]",
            )}
        >
            {children}
        </button>
    )
}

function LocalEmptyIcon(props: { className?: string }) {
    return <FolderOpen {...props} />
}

function MusicEmptyIcon(props: { className?: string }) {
    return <Music2 {...props} />
}

export { HeroRetryButton, LocalEmptyIcon, MusicEmptyIcon, StateHero }
export type { StateHeroProps, StateHeroVariant }