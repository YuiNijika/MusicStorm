import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect, useRef, useState } from "react"

import { notifyError } from "@/lib/notify"

const DESKTOP_LYRIC_VISIBILITY_EVENT = "musicstorm:desktop-lyric-visibility"

type DesktopLyricWindowResult = { visible?: boolean; supported?: boolean } | null

// 窗口可能在设置页之外被关掉（歌词窗自身关闭钮），toggle 前先查真实状态，
// 避免「开关点两次才生效」；show/hide 成功后广播，同步 hook 与设置页
export function useDesktopLyric() {
  const [isVisible, setIsVisible] = useState(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    invoke<boolean>("is_desktop_lyric_visible")
      .then(setIsVisible)
      .catch(() => setIsVisible(false))
    function onVisibility(event: Event) {
      setIsVisible((event as CustomEvent<boolean>).detail)
    }
    window.addEventListener(DESKTOP_LYRIC_VISIBILITY_EVENT, onVisibility)
    return () =>
      window.removeEventListener(DESKTOP_LYRIC_VISIBILITY_EVENT, onVisibility)
  }, [])

  function broadcast(visible: boolean) {
    setIsVisible(visible)
    window.dispatchEvent(
      new CustomEvent(DESKTOP_LYRIC_VISIBILITY_EVENT, { detail: visible }),
    )
  }

  const show = useCallback(async () => {
    try {
      // 宿主可能因平台不支持而拒绝创建窗口，必须以其返回值为准
      const result = await invoke<DesktopLyricWindowResult>("show_desktop_lyric")
      broadcast(result?.visible !== false)
    } catch (error) {
      notifyError("打开桌面歌词失败", {
        description: error instanceof Error ? error.message : "请重试",
      })
    }
  }, [])

  const hide = useCallback(async () => {
    try {
      await invoke("hide_desktop_lyric")
      broadcast(false)
    } catch (error) {
      notifyError("关闭桌面歌词失败", {
        description: error instanceof Error ? error.message : "请重试",
      })
    }
  }, [])

  const toggle = useCallback(async () => {
    if (pendingRef.current) {
      return
    }
    pendingRef.current = true
    try {
      // 以窗口真实可见性为准，防止本地状态漂移后首次点击变成无效 hide
      const visible = await invoke<boolean>("is_desktop_lyric_visible").catch(
        () => false,
      )
      // 乐观翻转：点击立即响应，失败再回滚，避免开关毫无反应的观感
      broadcast(!visible)
      if (visible) {
        await invoke("hide_desktop_lyric")
        broadcast(false)
      } else {
        const result = await invoke<DesktopLyricWindowResult>("show_desktop_lyric")
        broadcast(result?.visible !== false)
      }
    } catch (error) {
      setIsVisible(false)
      notifyError("切换桌面歌词失败", {
        description: error instanceof Error ? error.message : "请重试",
      })
    } finally {
      pendingRef.current = false
    }
  }, [])

  return {
    isVisible,
    show,
    hide,
    toggle,
  }
}
