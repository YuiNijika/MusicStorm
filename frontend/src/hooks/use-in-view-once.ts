import { useEffect, useRef, useState } from "react"

/**
 * 进入视口后置位一次，供区块懒加载使用。
 * 首屏一次性渲染大量卡片会拖慢首帧，改为滚动到区块附近再拉取数据。
 */
function useInViewOnce<T extends HTMLElement>(rootMargin = "300px") {
    const ref = useRef<T | null>(null)
    const [isInView, setIsInView] = useState(false)

    useEffect(() => {
        if (isInView) {
            return
        }
        const node = ref.current
        if (!node) {
            return
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    setIsInView(true)
                    observer.disconnect()
                }
            },
            { rootMargin },
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [isInView, rootMargin])

    return { ref, isInView }
}

export { useInViewOnce }
