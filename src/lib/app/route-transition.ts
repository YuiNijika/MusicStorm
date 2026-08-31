import { flushSync } from "react-dom"

/**
 * 路由切换载入动画：包一层 View Transitions，主内容区淡出/淡入
 * （固定 fade，CSS 在 Style.css 的 vt-route-* 规则）。
 * 系统减动效、性能模式时直接切换不建快照。
 */
function runRouteTransition(mutate: () => void): void {
    const root = document.documentElement
    if (
        typeof document === "undefined" ||
        !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        root.classList.contains("performance-mode")
    ) {
        mutate()
        return
    }

    // flushSync 让新页面在截帧前完成提交，快照才能捕捉到目标页
    root.classList.add("vt-route-fade")
    const transition = document.startViewTransition(() => {
        flushSync(mutate)
    })
    void transition.finished.finally(() => {
        root.classList.remove("vt-route-fade")
    })
}

export { runRouteTransition }
