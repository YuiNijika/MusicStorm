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
                "apple-control inline-flex h-9 cursor-pointer items-center gap-0.5 px-2.5",
                "text-[13px] font-medium text-primary",
            )}
        >
            <ChevronLeft className="size-4" strokeWidth={2.25} />
            {label}
        </button>
    )
}

export { BackButton }