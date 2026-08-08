import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type HScrollProps = {
    children: ReactNode
    className?: string
}

function HScroll({ children, className }: HScrollProps) {
    return (
        <div
            className={cn(
                "apple-scroll -mx-1 flex gap-4 overflow-x-auto px-1 pb-2",
                "snap-x snap-mandatory scroll-smooth",
                "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                className,
            )}
        >
            {children}
        </div>
    )
}

export { HScroll }