import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect, useRef, useState } from "react"

import { notifyError } from "@/lib/notify"

const MINI_PLAYER_VISIBILITY_EVENT = "musicstorm:mini-player-visibility"

// 与桌面歌词开关同一模式：toggle 前先查窗口真实可见性，show/hide 后广播同步
export function useMiniPlayer() {
  const [isVisible, setIsVisible] = useState(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    invoke<boolean>("is_mini_player_visible")
      .then(setIsVisible)
      .catch(() => setIsVisible(false))
    function onVisibility(event: Event) {
      setIsVisible((event as CustomEvent<boolean>).detail)
    }
    window.addEventListener(MINI_PLAYER_VISIBILITY_EVENT, onVisibility)
    return () =>
      window.removeEventListener(MINI_PLAYER_VISIBILITY_EVENT, onVisibility)
  }, [])

  function broadcast(visible: boolean) {
    setIsVisible(visible)
    window.dispatchEvent(
      new CustomEvent(MINI_PLAYER_VISIBILITY_EVENT, { detail: visible }),
    )
  }

  const show = useCallback(async () => {
    try {
      await invoke("show_mini_player")
      broadcast(true)
    } catch (error) {
      notifyError("打开桌面小播放器失败", {
        description: error instanceof Error ? error.message : "请重试",
      })
    }
  }, [])

  const hide = useCallback(async () => {
    try {
      await invoke("hide_mini_player")
      broadcast(false)
    } catch (error) {
      notifyError("关闭桌面小播放器失败", {
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
      const visible = await invoke<boolean>("is_mini_player_visible").catch(
        () => false,
      )
      // 乐观翻转：点击立即响应，失败再回滚，避免开关毫无反应的观感
      broadcast(!visible)
      if (visible) {
        await invoke("hide_mini_player")
      } else {
        await invoke("show_mini_player")
      }
    } catch (error) {
      setIsVisible(false)
      notifyError("切换桌面小播放器失败", {
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
