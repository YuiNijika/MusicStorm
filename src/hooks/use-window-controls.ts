import { getCurrentWindow } from "@tauri-apps/api/window"

import { getTitleBarDoubleClickAction } from "@/lib/app/title-bar-prefs"
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react"

const DOUBLE_CLICK_MS = 300

export function useWindowControls() {
    // 移动端/浏览器预览无桌面窗口：getCurrentWindow 可能抛错，用兜底空窗口
    const appWindow = useMemo(() => {
        try {
            return getCurrentWindow()
        } catch {
            return null
        }
    }, [])
    const [isMaximized, setIsMaximized] = useState(false)
    // 双击判定：双击标题栏 = 最大化/还原/最小化（动作可在设置中配置）
    const lastPressAtRef = useRef(0)

    useEffect(() => {
        if (!appWindow) {
            return
        }
        void appWindow.isMaximized().then(setIsMaximized).catch(() => {
            setIsMaximized(false)
        })
    }, [appWindow])

    const minimize = useCallback(() => {
        if (!appWindow) {
            return
        }
        void appWindow.minimize().catch(() => undefined)
    }, [appWindow])

    const toggleMaximize = useCallback(() => {
        if (!appWindow) {
            return
        }
        void (async () => {
            try {
                await appWindow.toggleMaximize()
                setIsMaximized(await appWindow.isMaximized())
            } catch {
                // 浏览器预览无 Tauri 运行时，忽略
            }
        })()
    }, [appWindow])

    const close = useCallback(() => {
        if (!appWindow) {
            return
        }
        void appWindow.close().catch(() => undefined)
    }, [appWindow])

    // 原生拖拽：startDragging 走系统 HTCAPTION 拖拽循环，窗口由 OS 移动，
    // 跟手无逐帧 setPosition IPC 延迟（支持 Aero 对齐/摇动置顶）。
    // 双击语义仍在 JS 判定：原生拖拽随 mouseup 结束，第二次按下会正常回到
    // WebView，此时按配置执行最大化/最小化，不再进入原生拖拽。
    const startDragging = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!appWindow || event.button !== 0) {
                return
            }
            // 触屏（移动端）无窗口可拖，跳过拖拽与双击判定
            if (event.pointerType !== "mouse") {
                return
            }
            const now = Date.now()
            const doubleClickAction = getTitleBarDoubleClickAction()
            if (
                doubleClickAction !== "none" &&
                now - lastPressAtRef.current < DOUBLE_CLICK_MS
            ) {
                lastPressAtRef.current = 0
                if (doubleClickAction === "minimize") {
                    void appWindow.minimize().catch(() => undefined)
                } else {
                    toggleMaximize()
                }
                return
            }
            lastPressAtRef.current = now
            event.preventDefault()
            void appWindow.startDragging().catch(() => undefined)
        },
        [appWindow, toggleMaximize],
    )

    return {
        isMaximized,
        minimize,
        toggleMaximize,
        close,
        startDragging,
    }
}
