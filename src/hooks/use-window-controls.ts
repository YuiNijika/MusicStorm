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
    const appWindow = useMemo(() => getCurrentWindow(), [])
    const [isMaximized, setIsMaximized] = useState(false)
    // 手动拖拽状态：系统 HTCAPTION 拖拽会吞掉双击事件，
    // 改用 pointer + setPosition 让双击语义完全归 JS 控制
    const dragRef = useRef<{
        pointerId: number
        startClientX: number
        startClientY: number
        startWindowX: number
        startWindowY: number
    } | null>(null)
    // 双击判定：macOS 双击标题栏 = 缩放/最小化
    const lastPressAtRef = useRef(0)

    useEffect(() => {
        void appWindow.isMaximized().then(setIsMaximized).catch(() => {
            setIsMaximized(false)
        })
    }, [appWindow])

    const minimize = useCallback(() => {
        void appWindow.minimize().catch(() => undefined)
    }, [appWindow])

    const toggleMaximize = useCallback(() => {
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
        void appWindow.close().catch(() => undefined)
    }, [appWindow])

    /**
     * 标题栏按下：300ms 内的第二次按下视为双击 → 最小化（macOS 双击标题栏语义）；
     * 否则进入手动拖拽，1:1 跟随指针移动窗口。
     */
    const startDragging = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (event.button !== 0) {
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
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        startWindowX: pos.x,
                        startWindowY: pos.y,
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
            if (!drag || event.pointerId !== drag.pointerId) {
                return
            }
            const dx = event.clientX - drag.startClientX
            const dy = event.clientY - drag.startClientY
            void appWindow
                .setPosition(
                    new PhysicalPosition(
                        drag.startWindowX + dx,
                        drag.startWindowY + dy,
                    ),
                )
                .catch(() => undefined)
        }

        function endDrag(event: PointerEvent) {
            const drag = dragRef.current
            if (!drag || event.pointerId !== drag.pointerId) {
                return
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
