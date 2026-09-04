import * as React from "react"

const MOBILE_BREAKPOINT = 768

// 同步初始化：首帧就用 matchMedia 判定，避免移动端先闪一帧桌面布局
// （全屏播放器翻页结构、骨架屏、toast 位置、控制条等都会随 isMobile 分流）
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false
    }
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
  })

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}