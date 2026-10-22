import { useEffect, useState } from "react"

import { coverPathToUrl, isTauriRuntime } from "@/lib/local/cover"
import { getCoverCacheLimitBytes } from "@/lib/music/cover-cache-prefs"
import {
    ensureRemoteCoverCached,
    getCachedRemoteCover,
    isBilibiliCoverUrl,
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
        return new URL(url).hostname !== "asset.localhost"
    } catch {
        return false
    }
}

function useCachedCoverUrl(
    src: string,
    kind: "original" | "thumbnail" = "original",
): string {
    const tauri = isTauriRuntime()
    const disabled = tauri && getCoverCacheLimitBytes() === 0
    const protectedRemote =
        tauri && isRemoteUrl(src) && isBilibiliCoverUrl(src)
    const [resolved, setResolved] = useState<string>(() => {
        if (!tauri || !isRemoteUrl(src)) {
            return src
        }
        const cached = getCachedRemoteCover(src)
        if (!cached) {
            return disabled ? src : protectedRemote ? "" : src
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
        if (!isRemoteUrl(src)) {
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

        setResolved(disabled ? src : protectedRemote ? "" : src)
        if (disabled) {
            return
        }

        void ensureRemoteCoverCached(src).then((next) => {
            if (!next) {
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
            setResolved(protectedRemote ? "" : src)
            void ensureRemoteCoverCached(src)
        }

        window.addEventListener(REMOTE_COVER_EVENT, onReady)
        return () => window.removeEventListener(REMOTE_COVER_EVENT, onReady)
    }, [src, kind, tauri, disabled, protectedRemote])

    return resolved
}

export { isRemoteUrl, useCachedCoverUrl }
