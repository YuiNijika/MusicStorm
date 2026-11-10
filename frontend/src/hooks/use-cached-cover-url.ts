import { useEffect, useState } from "react"

import { coverPathToUrl, isTauriRuntime } from "@/lib/local/cover"
import { getCoverCacheLimitBytes } from "@/lib/music/cover-cache-prefs"
import {
    ensureRemoteCoverCached,
    getCachedRemoteCover,
    REMOTE_COVER_EVENT,
} from "@/lib/music/remote-cover-cache"

function resolveAssetUrl(
    path: string | null | undefined,
    fallback: string,
): string {
    return coverPathToUrl(path) || fallback
}

function isRemoteUrl(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) {
        return false
    }
    try {
        const host = new URL(url).hostname
        return host !== "asset.localhost" && host !== "app.local"
    } catch {
        return false
    }
}

function useCachedCoverUrl(
    src: string,
    kind: "original" | "thumbnail" = "original",
    options: { ignoreCacheLimit?: boolean } = {},
): string {
    const tauri = isTauriRuntime()
    const disabled =
        tauri &&
        !options.ignoreCacheLimit &&
        getCoverCacheLimitBytes() === 0
    const remote = isRemoteUrl(src)
    const [resolved, setResolved] = useState<string>(() => {
        if (!tauri || !remote) {
            return src
        }
        const cached = getCachedRemoteCover(src)
        if (!cached) {
            return src
        }
        return resolveAssetUrl(
            kind === "thumbnail"
                ? cached.thumbnailPath
                : cached.originalPath,
            "",
        )
    })

    useEffect(() => {
        if (!tauri) {
            return
        }
        if (!remote) {
            setResolved(src)
            return
        }

        const cached = getCachedRemoteCover(src)
        if (cached) {
            setResolved(
                resolveAssetUrl(
                    kind === "thumbnail"
                        ? cached.thumbnailPath
                        : cached.originalPath,
                    "",
                ),
            )
            return
        }

        // 缓存未命中时保留远程地址，让图片立即可见；后台缓存完成后再透明切换。
        // 之前这里对 B 站图片返回空字符串，会在首帧请求已经发出后卸载 <img>，
        // 表现为网络面板有资源但页面仍空白。
        setResolved(src)
        if (disabled) {
            return
        }

        let cancelled = false
        void ensureRemoteCoverCached(src).then((next) => {
            if (cancelled || !next) {
                return
            }
            setResolved(
                resolveAssetUrl(
                    kind === "thumbnail"
                        ? next.thumbnailPath
                        : next.originalPath,
                    "",
                ),
            )
        })

        function onReady(event: Event): void {
            const detail = (event as CustomEvent<string>).detail
            if (detail && detail !== src) {
                return
            }
            const latest = getCachedRemoteCover(src)
            if (latest) {
                setResolved(
                    resolveAssetUrl(
                        kind === "thumbnail"
                            ? latest.thumbnailPath
                            : latest.originalPath,
                        "",
                    ),
                )
                return
            }
            setResolved(src)
            void ensureRemoteCoverCached(src)
        }

        window.addEventListener(REMOTE_COVER_EVENT, onReady)
        return () => {
            cancelled = true
            window.removeEventListener(REMOTE_COVER_EVENT, onReady)
        }
    }, [src, kind, tauri, disabled, remote])

    return resolved
}

export { isRemoteUrl, useCachedCoverUrl }
