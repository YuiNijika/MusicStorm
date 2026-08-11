import { useEffect, useRef } from "react"

/**
 * 滚动进入可视区时给元素加 .is-visible，配合 .reveal 做入场过渡。
 * 只加一次不回撤：营销页内容入场后无需随滚动反复重播。
 *
 * 路由切换（docs ↔ home）会卸载重建 .reveal 元素，仅首次扫描会漏掉它们，
 * 因此用 MutationObserver 监听子树变化，对新增的 .reveal 补观察。
 */
function useReveal<T extends HTMLElement>() {
    const ref = useRef<T>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) {
            return
        }
        if (typeof IntersectionObserver === "undefined") {
            el.classList.add("is-visible")
            return
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) {
                        continue
                    }
                    entry.target.classList.add("is-visible")
                    observer.unobserve(entry.target)
                }
            },
            { threshold: 0.15 },
        )

        // 已交给 observer 的 target；避免重复 observe 同一节点
        const observed = new Set<Element>()

        const scan = () => {
            el.querySelectorAll<HTMLElement>(".reveal").forEach((target) => {
                if (target.classList.contains("is-visible")) {
                    return
                }
                if (observed.has(target)) {
                    return
                }
                observed.add(target)
                observer.observe(target)
            })
        }
        scan()

        // 路由切换 / 异步渲染会挂载新的 .reveal，补观察而不重扫已处理的
        const mutation = new MutationObserver(() => scan())
        mutation.observe(el, { childList: true, subtree: true })

        return () => {
            observer.disconnect()
            mutation.disconnect()
        }
    }, [])

    return ref
}

export { useReveal }
