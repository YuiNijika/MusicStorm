import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type CoverProps = {
    src: string
    alt: string
    size?: "xs" | "sm" | "md" | "lg" | "xl"
    className?: string
}

const SIZE_CLASS = {
    xs: "size-9 rounded-[7px]",
    sm: "size-10 rounded-[8px]",
    md: "size-12 rounded-[10px]",
    lg: "size-[72px] rounded-[14px]",
    xl: "aspect-square w-full rounded-[14px]",
} as const

const SIZE_PX = {
    xs: { width: 36, height: 36 },
    sm: { width: 40, height: 40 },
    md: { width: 48, height: 48 },
    lg: { width: 72, height: 72 },
    xl: { width: 320, height: 320 },
} as const

function Cover({ src, alt, size = "md", className }: CoverProps) {
    const [failed, setFailed] = useState(false)
    // src 切换时必须重置，否则上一张失败会永远挡住后续封面
    useEffect(() => {
        setFailed(false)
    }, [src])
    const showImage = Boolean(src) && !failed
    const px = SIZE_PX[size]

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
                    width={px.width}
                    height={px.height}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
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
