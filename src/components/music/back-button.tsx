import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/** 详情页返回：轻量胶囊，Apple 导航习惯 */
function BackButton({
    onClick,
    label = "返回",
}: {
    onClick: () => void
    label?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex cursor-pointer items-center gap-0.5 rounded-full px-2 py-1",
                "text-[13px] font-medium text-primary",
                "transition-colors hover:bg-primary/8 active:scale-[0.98]",
            )}
        >
            <ChevronLeft className="size-4" strokeWidth={2.25} />
            {label}
        </button>
    )
}

export { BackButton }