import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type CoverProps = {
    src: string
    alt: string
    size?: "sm" | "md" | "lg" | "xl"
    className?: string
}

const SIZE_CLASS = {
    sm: "size-10 rounded-lg",
    md: "size-12 rounded-xl",
    lg: "size-[72px] rounded-2xl",
    xl: "aspect-square w-full rounded-[22px]",
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
                "relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.04] dark:from-slate-700 dark:to-slate-900 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] dark:ring-white/[0.06]",
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