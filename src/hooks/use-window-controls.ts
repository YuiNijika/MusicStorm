import { getCurrentWindow } from "@tauri-apps/api/window"
import { PhysicalPosition } from "@tauri-apps/api/dpi"
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
    // 手动拖拽状态：系统 HTCAPTION 拖拽会吞掉双击事件，
    // 改用 pointer + setPosition 让双击语义完全归 JS 控制
    const dragRef = useRef<{
        pointerId: number
        // 用屏幕坐标（screenX/Y）而非视口坐标：视口随窗口移动，
        // 用 clientX/Y 会形成反馈循环导致拖动抖动闪烁
        startScreenX: number
        startScreenY: number
        startWindowX: number
        startWindowY: number
        // rAF 节流：setPosition 是 IPC 调用，逐帧调用可能跟不上指针频率
        pending: { x: number; y: number } | null
        frameScheduled: boolean
    } | null>(null)
    // 双击判定：macOS 双击标题栏 = 缩放/最小化
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

    /**
     * 标题栏按下：300ms 内的第二次按下视为双击 → 最小化（macOS 双击标题栏语义）；
     * 否则进入手动拖拽，1:1 跟随指针移动窗口。
     */
    const startDragging = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!appWindow || event.button !== 0) {
                return
            }
            // 触屏（移动端）无窗口可拖，跳过拖拽与双击最小化判定
            if (event.pointerType !== "mouse") {
                return
            }
            const now = Date.now()
            if (now - lastPressAtRef.current < DOUBLE_CLICK_MS) {
                lastPressAtRef.current = 0
                dragRef.current = null
                void appWindow.minimize().catch(() => undefined)
                return
            }
            lastPressAtRef.current = now

            if (dragRef.current) {
                return
            }
            event.preventDefault()
            void (async () => {
                try {
                    const pos = await appWindow.outerPosition()
                    dragRef.current = {
                        pointerId: event.pointerId,
                        startScreenX: event.screenX,
                        startScreenY: event.screenY,
                        startWindowX: pos.x,
                        startWindowY: pos.y,
                        pending: null,
                        frameScheduled: false,
                    }
                    const win = event.currentTarget as HTMLElement
                    win.setPointerCapture?.(event.pointerId)
                } catch {
                    // 浏览器预览无 Tauri 运行时
                }
            })()
        },
        [appWindow],
    )

    useEffect(() => {
        function onPointerMove(event: PointerEvent) {
            const drag = dragRef.current
            if (!appWindow || !drag || event.pointerId !== drag.pointerId) {
                return
            }
            const dx = event.screenX - drag.startScreenX
            const dy = event.screenY - drag.startScreenY
            // 只记录最新位置，rAF 里统一发送，避免高频 IPC 抖动
            drag.pending = {
                x: drag.startWindowX + dx,
                y: drag.startWindowY + dy,
            }
            if (!drag.frameScheduled) {
                drag.frameScheduled = true
                requestAnimationFrame(() => {
                    const current = dragRef.current
                    if (current) {
                        current.frameScheduled = false
                    }
                    flushPendingPosition()
                })
            }
        }

        function flushPendingPosition() {
            const drag = dragRef.current
            if (!appWindow || !drag?.pending) {
                return
            }
            const { x, y } = drag.pending
            drag.pending = null
            void appWindow
                .setPosition(new PhysicalPosition(x, y))
                .catch(() => undefined)
        }

        function endDrag(event: PointerEvent) {
            const drag = dragRef.current
            if (!appWindow || !drag || event.pointerId !== drag.pointerId) {
                return
            }
            // 松手前把最后一次 pending 位置落定
            if (drag.pending) {
                const { x, y } = drag.pending
                drag.pending = null
                void appWindow
                    .setPosition(new PhysicalPosition(x, y))
                    .catch(() => undefined)
            }
            dragRef.current = null
        }

        window.addEventListener("pointermove", onPointerMove)
        window.addEventListener("pointerup", endDrag)
        window.addEventListener("pointercancel", endDrag)
        return () => {
            window.removeEventListener("pointermove", onPointerMove)
            window.removeEventListener("pointerup", endDrag)
            window.removeEventListener("pointercancel", endDrag)
        }
    }, [appWindow])

    return {
        isMaximized,
        minimize,
        toggleMaximize,
        close,
        startDragging,
    }
}
