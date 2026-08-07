import { useEffect, useState } from "react"

import { coverPathToUrl } from "@/lib/local/cover"
import {
    REMOTE_COVER_EVENT,
    ensureRemoteCoverCached,
    getCachedRemoteCover,
} from "@/lib/music/remote-cover-cache"

function isRemoteUrl(url: string): boolean {
    return /^https?:\/\//i.test(url)
}

/**
 * 远程封面 → 本地缓存 URL 的透明升级：
 * - 本地 / data: / asset: 原样返回
 * - 远程且已缓存 → 立即用本地 asset URL（离线可用）
 * - 远程未缓存 → 先用远程渲染，后台下载完成后切换本地并触发重渲染
 * 供 Cover 与全屏背景等所有封面渲染点统一使用。
 */
function useCachedCoverUrl(
    src: string,
    kind: "original" | "thumbnail" = "original",
): string {
    const [resolved, setResolved] = useState<string>(() => {
        if (!isRemoteUrl(src)) {
            return src
        }
        const cached = getCachedRemoteCover(src)
        return cached
            ? coverPathToUrl(kind === "thumbnail" ? cached.thumbnailPath : cached.originalPath)
            : src
    })

    useEffect(() => {
        if (!isRemoteUrl(src)) {
            setResolved(src)
            return
        }
        // 已缓存直接切本地；未缓存先保持远程，后台下载完成后事件触发切换
        const cached = getCachedRemoteCover(src)
        if (cached) {
            setResolved(
                coverPathToUrl(
                    kind === "thumbnail" ? cached.thumbnailPath : cached.originalPath,
                ),
            )
            return
        }
        setResolved(src)
        void ensureRemoteCoverCached(src)

        function onReady(event: Event) {
            const detail = (event as CustomEvent<string>).detail
            if (detail && detail !== src) {
                return
            }
            const latest = getCachedRemoteCover(src)
            if (latest) {
                setResolved(
                    coverPathToUrl(
                        kind === "thumbnail"
                            ? latest.thumbnailPath
                            : latest.originalPath,
                    ),
                )
            }
        }
        window.addEventListener(REMOTE_COVER_EVENT, onReady)
        return () => window.removeEventListener(REMOTE_COVER_EVENT, onReady)
    }, [src, kind])

    return resolved
}

export { useCachedCoverUrl }
