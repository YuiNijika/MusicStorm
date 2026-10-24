import { useEffect, useRef } from "react"

import { fetchBilibiliVideo } from "@/lib/bilibili/api"
import { mapVideoData } from "@/lib/bilibili/map"
import { mapNeteaseSongToTrack } from "@/lib/netease/map-track"
import { fetchSongDetail } from "@/lib/netease/track"
import type { Track } from "@/lib/types"

/**
 *从输入里解析网易云歌曲 id或 B站 BV号，支持网页站 hash与应用协议两种入口。
*/
type PlayDeepLink = {
 id: string
 source: "netease" | "bilibili"
 bvid?: string
}

function parsePlayLink(input: string): PlayDeepLink | null {
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
 const id = params.get("id")?.trim() ?? ""
 const bvid = params.get("bvid")?.trim() ?? ""
 const source =
 params.get("source") === "bilibili" || bvid
 ? "bilibili"
 : "netease"
 if (
 (source === "bilibili" && !bvid) ||
 (source === "netease" && (!id || !/^\d+$/.test(id)))
 ) {
        return null
    }
 return {
 id: id || `bilibili:${bvid}`,
 source,
 bvid: bvid || undefined,
 }
}

/**
 *消费深链并直达播放：网页站启动读取一次 hash，应用经深链事件转发后同样直达播放。
 */
function useDeepLinkPlayback(onResolved: (track: Track) => void): void {
 const resolvedRef = useRef(onResolved)
    const consumedHash = useRef(false)

    useEffect(() => {
 async function playDeepLink(link: PlayDeepLink) {
            try {
 if (link.source === "bilibili") {
 if (!link.bvid) {
 return
 }
 const data = await fetchBilibiliVideo({ bvid: link.bvid })
 const track = mapVideoData(data)
 if (track) {
 resolvedRef.current(track)
 }
 return
 }
 const result = await fetchSongDetail(link.id)
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
 const link = parsePlayLink(window.location.hash)
 if (link) {
                consumedHash.current = true
 void playDeepLink(link)
            }
        }

        // 2) 应用自定义协议拉起后经桥转发的深链事件（桌面 + Android）
        const onDeepLink = (event: Event) => {
            const detail = (event as CustomEvent<{ url?: string }>).detail
 const link = parsePlayLink(detail?.url ?? "")
 if (link) {
 void playDeepLink(link)
            }
        }
        window.addEventListener("musicstorm:deep-link", onDeepLink)
        return () =>
            window.removeEventListener("musicstorm:deep-link", onDeepLink)
    }, [])
}

export { useDeepLinkPlayback }
