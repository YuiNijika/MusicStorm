import { useState } from "react"

import { useCachedCoverUrl } from "@/hooks/use-cached-cover-url"
import { cn } from "@/lib/utils"

type AccountAvatarProps = {
    src: string
    name: string
    pixels: number
    className?: string
    eager?: boolean
}

function AccountAvatar({
    src,
    name,
    pixels,
    className,
    eager = false,
}: AccountAvatarProps) {
    const resolved = useCachedCoverUrl(src, "thumbnail", {
        ignoreCacheLimit: true,
    })
    const [failedSrc, setFailedSrc] = useState("")
    const initial = name.trim().slice(0, 1).toUpperCase() || "B"
    const canRenderImage = Boolean(resolved && resolved !== failedSrc)

    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-fill)] text-[13px] font-medium text-muted-foreground",
                className,
            )}
            style={{ width: pixels, height: pixels }}
        >
            {canRenderImage ? (
                <img
                    src={resolved}
                    alt=""
                    width={pixels}
                    height={pixels}
                    loading={eager ? "eager" : "lazy"}
                    fetchPriority={eager ? "high" : "auto"}
                    decoding="async"
                    className="size-full object-cover"
                    onError={() => setFailedSrc(resolved)}
                />
            ) : (
                <span aria-hidden="true">{initial}</span>
            )}
        </span>
    )
}

export { AccountAvatar }
