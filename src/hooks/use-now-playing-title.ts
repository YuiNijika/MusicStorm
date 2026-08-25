import { useEffect } from "react"

import { usePlayer } from "@/hooks/use-player"

// 曲目在档时标签页标题带上当前歌，切窗口时一眼定位；无曲目回落应用名
function useNowPlayingTitle() {
    const { currentTrack } = usePlayer()

    useEffect(() => {
        if (!currentTrack) {
            document.title = "MusicStorm"
            return
        }
        document.title = `${currentTrack.title} - ${currentTrack.artist} - MusicStorm`
    }, [currentTrack])
}

export { useNowPlayingTitle }