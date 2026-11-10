import { memo, useEffect, useState } from "react"

import { useCachedCoverUrl, isRemoteUrl } from "@/hooks/use-cached-cover-url"
import { reextractLocalCovers } from "@/lib/local/import-folder"
import {
    invalidateRemoteCover,
    isBilibiliCoverUrl,
} from "@/lib/music/remote-cover-cache"
import { cn } from "@/lib/utils"

type CoverProps = {
    src: string
    alt: string
    size?: "xs" | "sm" | "md" | "lg" | "xl"
    className?: string
    /** Above-the-fold artwork should bypass lazy loading */
    eager?: boolean
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

// memo：src/alt/size/className 均为稳定字符串 props，父组件高频重渲（如播放条 200ms tick）时整棵跳过
const Cover = memo(function Cover({ src, alt, size = "md", className, eager = false }: CoverProps) {
    const [failed, setFailed] = useState(false)
    // 远程封面透明升级为本地缓存（xs/sm/md 用缩略图，lg/xl 用原图）
    const kind = size === "lg" || size === "xl" ? "original" : "thumbnail"
    const resolvedSrc = useCachedCoverUrl(src, kind)
    // src 或 resolvedSrc 变化时必须重置，否则上一张失败会永远挡住后续封面。
    // 自愈链路（invalidate→重下→事件切回本地）会更新 resolvedSrc，依赖这里复位。
    useEffect(() => {
        setFailed(false)
    }, [src, resolvedSrc])
    const imageSrc = resolvedSrc
    const showImage = Boolean(src && imageSrc) && !failed
    const px = SIZE_PX[size]

    // 本地缓存文件被清理后索引残留失效路径会在这里炸出 404：
    // 远程封面剔除索引条目并回源重下；本地封面（asset 路径）触发
    // 曲库重解析原音频提取封面（带冷却，多图同时 404 只重扫一次）
    function handleImageError() {
        setFailed(true)
        if (isRemoteUrl(src)) {
            // 远程地址可能被防盗链、CSP 或临时网络错误拦截。先显示占位，
            // 同时让原生命令带 Referer 重下；成功后 resolvedSrc 变化会自动恢复。
            void invalidateRemoteCover(src)
            return
        }
        if (src.startsWith("asset") || src.includes("/covers/")) {
            void reextractLocalCovers().catch(() => { })
        }
    }

    return (
        <div
            className={cn(
                "apple-card-shadow relative shrink-0 overflow-hidden bg-gradient-to-br from-neutral-200 to-neutral-300 ring-1 ring-foreground/10 dark:from-neutral-700 dark:to-neutral-900",
                SIZE_CLASS[size],
                className,
            )}
        >
            {showImage ? (
                <img
                    key={imageSrc}
                    src={imageSrc}
                    alt={alt}
                    width={px.width}
                    height={px.height}
                    draggable={false}
                    referrerPolicy={
                        isBilibiliCoverUrl(src) ? "no-referrer" : undefined
                    }
                    loading={eager ? "eager" : "lazy"}
                    fetchPriority={eager ? "high" : "auto"}
                    decoding="async"
                    className="size-full object-cover"
                    onError={handleImageError}
                />
            ) : (
                <div
                    aria-hidden
                    className="flex size-full items-center justify-center text-[11px] font-semibold tracking-[0.08em] text-muted-foreground"
                >
                    MS
                </div>
            )}
        </div>
    )
})

export { Cover }
