import { useEffect, useState } from "react"

import {
    LAYOUT_EVENT,
    readLibraryLayout,
    type LibraryLayoutPrefs,
} from "@/lib/library/layout-prefs"

/** 订阅歌单展示偏好（卡片 / 列表） */
function useLibraryLayout(): LibraryLayoutPrefs {
    const [prefs, setPrefs] = useState<LibraryLayoutPrefs>(() => readLibraryLayout())

    useEffect(() => {
        function sync() {
            setPrefs(readLibraryLayout())
        }
        window.addEventListener(LAYOUT_EVENT, sync)
        window.addEventListener("storage", sync)
        return () => {
            window.removeEventListener(LAYOUT_EVENT, sync)
            window.removeEventListener("storage", sync)
        }
    }, [])

    return prefs
}

export { useLibraryLayout }