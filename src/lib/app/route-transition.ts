import { flushSync } from "react-dom"

let activeTransition: ViewTransition | null = null
let suppressNextTransition = false

function suppressNextRouteTransition(): void {
    suppressNextTransition = true
    queueMicrotask(() => {
        suppressNextTransition = false
    })
}

/**
 * 路由切换载入动画：包一层 View Transitions，主内容区淡出/淡入
 * （固定 fade，CSS 在 Style.css 的 vt-route-* 规则）。
 * 系统减动效、性能模式时直接切换不建快照。
 */
function runRouteTransition(mutate: () => void): void {
    const root = document.documentElement
    if (suppressNextTransition) {
        suppressNextTransition = false
        activeTransition?.skipTransition()
        activeTransition = null
        mutate()
        return
    }
    if (
        typeof document === "undefined" ||
        !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        root.classList.contains("performance-mode")
    ) {
        mutate()
        return
    }

    activeTransition?.skipTransition()
    activeTransition = null

    // flushSync 让新页面在截帧前完成提交，快照才能捕捉到目标页
    root.classList.add("vt-route-fade")
    let transition: ViewTransition
    try {
        transition = document.startViewTransition(() => {
            flushSync(mutate)
        })
    } catch {
        root.classList.remove("vt-route-fade")
        mutate()
        return
    }
    activeTransition = transition
    void transition.finished
        .catch(() => undefined)
        .finally(() => {
            if (activeTransition === transition) {
                activeTransition = null
            }
            root.classList.remove("vt-route-fade")
        })
}

export { runRouteTransition, suppressNextRouteTransition }
