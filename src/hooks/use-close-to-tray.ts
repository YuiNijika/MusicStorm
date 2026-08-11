import { useEffect } from "react"

import { getCloseToTray } from "@/lib/app/close-to-tray-prefs"

// 关闭窗口两条路：开「最小化到托盘」→ 隐藏继续播放；
// 关闭该选项 → 走与托盘菜单「退出」一致的 exit_app 彻底退出。
// 不能依赖「不 preventDefault 就走默认关闭」：Windows 自定义窗口下
// 该默认路径不可靠（窗口关而不退/无响应），必须显式退出。
function useCloseToTray() {
    useEffect(() => {
        let unlisten: (() => void) | null = null
        let cancelled = false

        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            if (cancelled) {
                return
            }
            const appWindow = getCurrentWindow()
            void appWindow.onCloseRequested(async (event) => {
                event.preventDefault()
                if (getCloseToTray()) {
                    await appWindow.hide().catch(() => undefined)
                    return
                }
                try {
                    const { invoke } = await import("@tauri-apps/api/core")
                    await invoke("exit_app")
                } catch {
                    // 浏览器预览无 tauri 运行时，退化为销毁窗口
                    await appWindow.destroy().catch(() => undefined)
                }
            }).then((stop) => {
                if (cancelled) {
                    stop()
                } else {
                    unlisten = stop
                }
            })
        })

        return () => {
            cancelled = true
            unlisten?.()
        }
    }, [])
}

export { useCloseToTray }
