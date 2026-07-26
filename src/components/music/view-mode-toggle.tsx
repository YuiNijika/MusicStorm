import { LayoutGrid, List } from "lucide-react"

import type { ViewMode } from "@/lib/library/layout-prefs"
import { cn } from "@/lib/utils"

type ViewModeToggleProps = {
    value: ViewMode
    onChange: (mode: ViewMode) => void
    className?: string
    /** 无障碍标签前缀 */
    label?: string
}

/** Apple 风格 卡片/列表 分段控件，挂标题右侧 */
function ViewModeToggle({
    value,
    onChange,
    className,
    label = "展示方式",
}: ViewModeToggleProps) {
    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                "inline-flex shrink-0 rounded-full bg-black/[0.06] p-0.5 dark:bg-white/[0.1]",
                className,
            )}
        >
            <button
                type="button"
                title="卡片"
                aria-pressed={value === "card"}
                onClick={() => onChange("card")}
                className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full transition-all",
                    value === "card"
                        ? "bg-background text-foreground shadow-sm dark:bg-white/15"
                        : "text-muted-foreground hover:text-foreground",
                )}
            >
                <LayoutGrid className="size-3.5" />
            </button>
            <button
                type="button"
                title="列表"
                aria-pressed={value === "list"}
                onClick={() => onChange("list")}
                className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full transition-all",
                    value === "list"
                        ? "bg-background text-foreground shadow-sm dark:bg-white/15"
                        : "text-muted-foreground hover:text-foreground",
                )}
            >
                <List className="size-3.5" />
            </button>
        </div>
    )
}

export { ViewModeToggle }