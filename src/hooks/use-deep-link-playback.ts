import { useEffect, useRef } from "react"

import { mapNeteaseSongToTrack } from "@/lib/netease/map-track"
import { fetchSongDetail } from "@/lib/netease/track"
import type { Track } from "@/lib/types"

/**
 * 从输入里解析出网易云歌曲 id。支持两种来源：
 * - 网页站 hash 深链：`#play?id=<id>`（或完整加载了 hash 的地址）
 * - 应用自定义协议：`musicstorm://play?id=<id>`（Android 拉起后经桥事件转发）
 * 格式不符返回 null。
 */
function parsePlayId(input: string): string | null {
    let body = input.trim()
    const schemeIdx = body.indexOf("://")
    if (schemeIdx >= 0) {
        body = body.slice(schemeIdx + 3)
    }
    body = body.replace(/^#/, "")
    if (!body.startsWith("play")) {
        return null
    }
    const params = new URLSearchParams(body.slice("play".length))
    const id = params.get("id") ?? ""
    if (!/^\d+$/.test(id)) {
        return null
    }
    return id
}

/**
 * 消费深链并直达播放：
 * - 网页站 hash 路由 `#play?id=<id>`（启动时读取一次）
 * - 应用自定义协议 `musicstorm://play?id=<id>`：桌面/移动端 app 经
 *   `musicstorm:deep-link` 事件（detail.url）转发到网页层后同样直达播放。
 */
function useDeepLinkPlayback(onResolved: (track: Track) => void): void {
    const resolvedRef = useRef(onResolved)
    resolvedRef.current = onResolved
    const consumedHash = useRef(false)

    useEffect(() => {
        async function playById(id: string) {
            try {
                const result = await fetchSongDetail(id)
                const song = result.songs?.[0]
                if (song) {
                    resolvedRef.current(mapNeteaseSongToTrack(song))
                }
            } catch {
                // 解析失败静默：留在正常 Web 壳内
            }
        }

        // 1) 启动即读取一次网页 hash 深链
        if (!consumedHash.current) {
            const id = parsePlayId(window.location.hash)
            if (id) {
                consumedHash.current = true
                void playById(id)
            }
        }

        // 2) 应用自定义协议拉起后经桥转发的深链事件（桌面 + Android）
        const onDeepLink = (event: Event) => {
            const detail = (event as CustomEvent<{ url?: string }>).detail
            const id = parsePlayId(detail?.url ?? "")
            if (id) {
                void playById(id)
            }
        }
        window.addEventListener("musicstorm:deep-link", onDeepLink)
        return () =>
            window.removeEventListener("musicstorm:deep-link", onDeepLink)
    }, [])
}

export { useDeepLinkPlayback }