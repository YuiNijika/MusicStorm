import { AudioLines, Music2 } from "lucide-react"

import { useFrontendMode } from "@/components/app/frontend-mode-provider"
import {
    FRONTEND_MODE_OPTIONS,
    type FrontendMode,
} from "@/lib/frontend-mode"
import type { AppRoute } from "@/lib/routes"
import { suppressNextRouteTransition } from "@/lib/app/route-transition"
import { cn } from "@/lib/utils"

type ModeSwitchProps = {
    variant?: "full" | "icon"
    onNavigate: (route: AppRoute) => void
    className?: string
}

const MODE_ICONS = {
    netease: Music2,
 bilibili: AudioLines,
} as const

function ModeSwitch({
    variant = "full",
    onNavigate,
    className,
}: ModeSwitchProps) {
    const { mode, layouts, setMode } = useFrontendMode()

    function switchMode(next: FrontendMode) {
        if (next === mode) {
            return
        }
        const firstVisible = layouts[next].find((item) => item.visible)
        const fallback = next === "bilibili" ? "bilibili" : "home"
        setMode(next)
        suppressNextRouteTransition()
        onNavigate(firstVisible?.id ?? fallback)
    }

    if (variant === "icon") {
        const next = mode === "netease" ? "bilibili" : "netease"
        const current = FRONTEND_MODE_OPTIONS.find((item) => item.id === mode)
        const nextLabel =
            FRONTEND_MODE_OPTIONS.find((item) => item.id === next)?.label ??
            ""
        const Icon = MODE_ICONS[mode]
        return (
            <button
                type="button"
                title={`切换到${nextLabel}`}
                aria-label={`切换到${nextLabel}`}
                onClick={() => switchMode(next)}
                className={cn(
                    "flex size-9 cursor-pointer items-center justify-center rounded-full",
                    "text-muted-foreground transition-[color,background-color,transform]",
                    "hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                    "active:scale-[0.95] active:duration-[var(--duration-press)]",
                    className,
                )}
            >
                <Icon className="size-[19px]" strokeWidth={1.9} />
                <span className="sr-only">{current?.label}</span>
            </button>
        )
    }

    return (
        <div
            role="group"
            aria-label="前端模式"
            className={cn(
                "grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-fill)] p-1",
                className,
            )}
        >
            {FRONTEND_MODE_OPTIONS.map((item) => {
                const Icon = MODE_ICONS[item.id]
                const active = mode === item.id
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => switchMode(item.id)}
                        className={cn(
                            "flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-medium",
                            "transition-[color,background-color,box-shadow,transform]",
                            "active:scale-[0.98] active:duration-[var(--duration-press)]",
                            "text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                        )}
                    >
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

export { ModeSwitch }
