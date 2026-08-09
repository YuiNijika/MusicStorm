import { useEffect, useRef } from "react"

/**
 * 滚动进入可视区时给元素加 .is-visible，配合 .reveal 做入场过渡。
 * 只加一次不回撤：营销页内容入场后无需随滚动反复重播。
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

        const targets = el.querySelectorAll(".reveal")
        targets.forEach((target) => observer.observe(target))
        return () => observer.disconnect()
    }, [])

    return ref
}

export { useReveal }
