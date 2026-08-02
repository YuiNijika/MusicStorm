import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type CoverProps = {
    src: string
    alt: string
    size?: "sm" | "md" | "lg" | "xl"
    className?: string
}

const SIZE_CLASS = {
    sm: "size-10 rounded-[8px]",
    md: "size-12 rounded-[10px]",
    lg: "size-[72px] rounded-[14px]",
    xl: "aspect-square w-full rounded-[14px]",
} as const

function Cover({ src, alt, size = "md", className }: CoverProps) {
    const [failed, setFailed] = useState(false)
    // src 切换时必须重置，否则上一张失败会永远挡住后续封面
    useEffect(() => {
        setFailed(false)
    }, [src])
    const showImage = Boolean(src) && !failed

    return (
        <div
            className={cn(
                "apple-card-shadow relative shrink-0 overflow-hidden bg-gradient-to-br from-neutral-200 to-neutral-300 ring-1 ring-black/[0.06] dark:from-neutral-700 dark:to-neutral-900 dark:ring-white/[0.08]",
                SIZE_CLASS[size],
                className,
            )}
        >
            {showImage ? (
                <img
                    key={src}
                    src={src}
                    alt={alt}
                    draggable={false}
                    className="size-full object-cover"
                    loading="lazy"
                    onError={() => setFailed(true)}
                />
            ) : (
                <div
                    aria-hidden
                    className="flex size-full items-center justify-center text-[11px] font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-300"
                >
                    MS
                </div>
            )}
        </div>
    )
}

export { Cover }