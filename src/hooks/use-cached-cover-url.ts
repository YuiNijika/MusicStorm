import { useEffect, useState } from "react"

import { coverPathToUrl } from "@/lib/local/cover"
import {
    REMOTE_COVER_EVENT,
    ensureRemoteCoverCached,
    getCachedRemoteCover,
} from "@/lib/music/remote-cover-cache"

function isRemoteUrl(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) {
        return false
    }
    // Windows 上 convertFileSrc 产出 http://asset.localhost，是本地 asset 虚拟协议，
    // 不是可下载的远程封面；误判会触发无意义的下载并可能污染缓存索引
    try {
        return new URL(url).hostname !== "asset.localhost"
    } catch {
        return false
    }
}

// 远程封面 → 本地缓存 URL 的透明升级：远程且已缓存立即用本地 asset（离线可用），未缓存先用远程渲染后台下载后切换
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
            // 空 detail 是索引剪枝的全局广播，所有挂载中的封面都重新解析
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
                return
            }
            // 索引条目已被剪枝（本地文件被清理）：回退远程渲染并重新下载
            setResolved(src)
            void ensureRemoteCoverCached(src)
        }
        window.addEventListener(REMOTE_COVER_EVENT, onReady)
        return () => window.removeEventListener(REMOTE_COVER_EVENT, onReady)
    }, [src, kind])

    return resolved
}

export { useCachedCoverUrl, isRemoteUrl }
