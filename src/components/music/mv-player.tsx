import { useEffect, useRef } from "react"

import Artplayer from "artplayer"
import Hls from "hls.js"

type MvPlayerProps = {
    url: string
    poster?: string
}

/**
 * MV 播放器：ArtPlayer + HLS 分片。
 * 网易云 MV 地址可能是 mp4 直链或 m3u8 分片流，
 * m3u8 走 hls.js 解码，其余交给原生能力。
 */
function MvPlayer({ url, poster }: MvPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const artRef = useRef<Artplayer | null>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) {
            return
        }
        // 主题色跟随应用强调色（--accent-hue CSS 变量）；逗号分隔 hsl 兼容性最好
        const hue = getComputedStyle(document.documentElement)
            .getPropertyValue("--accent-hue")
            .trim()
        const theme = hue ? `hsl(${hue}, 70%, 62%)` : "#0a84ff"

        const art = new Artplayer({
            container,
            url,
            poster,
            autoplay: true,
            autoMini: false,
            fullscreen: true,
            volume: 0.8,
            theme,
            type: url.includes(".m3u8") ? "m3u8" : "auto",
            customType: {
                m3u8: (video: HTMLVideoElement, src: string, player: Artplayer) => {
                    if (Hls.isSupported()) {
                        const hls = new Hls()
                        hls.loadSource(src)
                        hls.attachMedia(video)
                        player.on("destroy", () => hls.destroy())
                    } else if (
                        video.canPlayType("application/vnd.apple.mpegurl")
                    ) {
                        video.src = src
                    } else {
                        player.notice.show = "当前环境不支持 HLS 播放"
                    }
                },
            },
        })
        artRef.current = art

        return () => {
            art.destroy(false)
            artRef.current = null
        }
    }, [url, poster])

    return (
        <div
            ref={containerRef}
            className="art-shell aspect-video w-full bg-black [&_.art-video]:aspect-video [&_.art-video]:w-full [&_.art-video]:object-contain"
        />
    )
}

export { MvPlayer }
