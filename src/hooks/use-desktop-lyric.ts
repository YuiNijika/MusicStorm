import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect, useState } from "react"

export function useDesktopLyric() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    invoke<boolean>("is_desktop_lyric_visible")
      .then(setIsVisible)
      .catch(() => setIsVisible(false))
  }, [])

  const show = useCallback(async () => {
    try {
      await invoke("show_desktop_lyric")
      setIsVisible(true)
    } catch (error) {
      console.error("Failed to show desktop lyric:", error)
    }
  }, [])

  const hide = useCallback(async () => {
    try {
      await invoke("hide_desktop_lyric")
      setIsVisible(false)
    } catch (error) {
      console.error("Failed to hide desktop lyric:", error)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (isVisible) {
      await hide()
    } else {
      await show()
    }
  }, [isVisible, show, hide])

  return {
    isVisible,
    show,
    hide,
    toggle,
  }
}