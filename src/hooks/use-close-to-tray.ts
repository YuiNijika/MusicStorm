import { useCallback, useEffect, useState } from "react"

import {
    getCloseAsk,
    getCloseToTray,
    setCloseAsk,
    setCloseToTray,
} from "@/lib/app/close-to-tray-prefs"
import { isWebMode } from "@/lib/web-mode"

// DevTools 是独立进程，窗口隐藏/退出时若不回收会一直在后台挂内存；
// 关闭窗口是唯一兜底时机，失败静默即可（浏览器预览无 tauri 运行时）
async function releaseDevTools(): Promise<void> {
    try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("close_devtools")
    } catch {
        // 无 tauri 运行时（浏览器预览）时忽略
    }
}

export type CloseAction = "tray" | "exit"

// 关闭窗口三条路：
// 未开启询问 → 按当前设置直接执行（托盘隐藏继续播放 / 彻底退出）；
// 开启询问 → 先弹确认框，用户选定动作并可勾选「不再提示」；
// 确认后把选择写回设置（触发事件让设置页开关同步），再执行动作。
// 不能依赖「不 preventDefault 就走默认关闭」：Windows 自定义窗口下
// 该默认路径不可靠（窗口关而不退/无响应），必须显式 hide 或 exit_app。
function useCloseToTray() {
    const [askOpen, setAskOpen] = useState(false)

    useEffect(() => {
        let unlisten: (() => void) | null = null
        let cancelled = false

        // 网页版无窗口关闭语义，跳过
        if (isWebMode()) {
            return () => {
                cancelled = true
            }
        }

        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            if (cancelled) {
                return
            }
            const appWindow = getCurrentWindow()
            void appWindow.onCloseRequested(async (event) => {
                event.preventDefault()
                // 询问开着 → 交给对话框；关掉 → 走记忆行为直接执行
                if (getCloseAsk()) {
                    setAskOpen(true)
                    return
                }
                void releaseDevTools()
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

    const cancelClose = useCallback(() => {
        setAskOpen(false)
    }, [])

    const confirmClose = useCallback(
        async (action: CloseAction, noAsk: boolean) => {
            setAskOpen(false)
            // 行为与设置同步：动作变化写回 closeToTray，勾了不再提示则关掉询问，
            // 两处都会广播事件，设置页开关随之更新
            if (getCloseToTray() !== (action === "tray")) {
                await setCloseToTray(action === "tray")
            }
            if (noAsk && getCloseAsk()) {
                await setCloseAsk(false)
            }
            const { getCurrentWindow } = await import("@tauri-apps/api/window")
            const appWindow = getCurrentWindow()
            void releaseDevTools()
            if (action === "tray") {
                await appWindow.hide().catch(() => undefined)
                return
            }
            try {
                const { invoke } = await import("@tauri-apps/api/core")
                await invoke("exit_app")
            } catch {
                await appWindow.destroy().catch(() => undefined)
            }
        },
        [],
    )

    return { askOpen, cancelClose, confirmClose }
}

export { useCloseToTray }
