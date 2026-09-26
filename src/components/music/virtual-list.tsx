import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type VirtualListProps<T> = {
    items: T[]
    itemHeight: number
    renderItem: (item: T, index: number) => ReactNode
    getItemKey: (item: T, index: number) => string
    className?: string
    overscanPx?: number
    virtualizeAfter?: number
}

type VisibleRange = {
    start: number
    end: number
}

function findScrollParent(element: HTMLElement): HTMLElement | Window {
    let parent = element.parentElement
    while (parent) {
        const style = window.getComputedStyle(parent)
        if (/(auto|scroll|overlay)/.test(style.overflowY)) {
            return parent
        }
        parent = parent.parentElement
    }
    return window
}

function readVisibleRange(
    list: HTMLElement,
    scrollParent: HTMLElement | Window,
    itemCount: number,
    itemHeight: number,
    overscanPx: number,
): VisibleRange {
    const listRect = list.getBoundingClientRect()
    const viewportTop =
        scrollParent === window
            ? 0
            : (scrollParent as HTMLElement).getBoundingClientRect().top
    const viewportBottom =
        scrollParent === window
            ? window.innerHeight
            : (scrollParent as HTMLElement).getBoundingClientRect().bottom

    // 快速滚动时单帧位移可能达整屏，overscan 至少覆盖一个视口高度，
    // 否则窗口跟不上滚动位置会出现空白
    const effectiveOverscan = Math.max(overscanPx, viewportBottom - viewportTop)

    const visibleTop = Math.max(0, viewportTop - listRect.top - effectiveOverscan)
    const visibleBottom = Math.min(
        itemCount * itemHeight,
        viewportBottom - listRect.top + effectiveOverscan,
    )
    const start = Math.min(
        Math.max(0, itemCount - 1),
        Math.max(0, Math.floor(visibleTop / itemHeight)),
    )
    const end = Math.min(
        itemCount,
        Math.max(start + 1, Math.ceil(Math.max(0, visibleBottom) / itemHeight)),
    )

    return { start, end }
}

// 感知外层页面滚动的固定行高虚拟列表；overscan 避免快速滚动空白。
// 监听只在虚拟化时挂载，卸载即回收，避免重复渲染叠加监听器造成内存泄漏。
function VirtualList<T>({
    items,
    itemHeight,
    renderItem,
    getItemKey,
    className,
    overscanPx = 720,
    virtualizeAfter = 80,
}: VirtualListProps<T>) {
    const listRef = useRef<HTMLDivElement>(null)
    const scrollParentRef = useRef<HTMLElement | Window | null>(null)
    const [range, setRange] = useState<VisibleRange>({ start: 0, end: 0 })
    const virtualized = items.length > virtualizeAfter

    const updateRange = useCallback(() => {
        const list = listRef.current
        if (!list) {
            return
        }
        // 滚动容器只算一次：每次滚动事件都走 DOM 链取 getComputedStyle 开销大
        if (!scrollParentRef.current) {
            scrollParentRef.current = findScrollParent(list)
        }
        const next = readVisibleRange(
            list,
            scrollParentRef.current,
            items.length,
            itemHeight,
            overscanPx,
        )
        // 同一帧内多次 scroll 事件若窗口没变则直接返回当前引用，React 跳过重渲
        setRange((current) =>
            current.start === next.start && current.end === next.end
                ? current
                : next,
        )
    }, [itemHeight, items.length, overscanPx])

    // 挂载后、绘制前先算好首屏范围，避免先空白再跳帧
    useLayoutEffect(() => {
        // 数据或虚拟化状态变化时滚动容器可能改变，重新探测一次
        scrollParentRef.current = null
        updateRange()
    }, [updateRange, virtualized])

    // 仅在虚拟化时挂载滚动与尺寸监听，卸载即回收，杜绝监听器泄漏
    useEffect(() => {
        if (!virtualized) {
            return
        }
        const list = listRef.current
        if (!list) {
            return
        }
        const scrollParent = findScrollParent(list)
        const eventTarget = scrollParent === window ? window : scrollParent
        const observer = new ResizeObserver(() => updateRange())

        eventTarget.addEventListener("scroll", updateRange, { passive: true })
        window.addEventListener("resize", updateRange, { passive: true })
        observer.observe(list)
        if (scrollParent !== window) {
            observer.observe(scrollParent as HTMLElement)
        }

        return () => {
            eventTarget.removeEventListener("scroll", updateRange)
            window.removeEventListener("resize", updateRange)
            observer.disconnect()
        }
    }, [virtualized, updateRange, items.length])

    const visibleItems = virtualized ? items.slice(range.start, range.end) : items
    const startIndex = virtualized ? range.start : 0
    const topSpacer = startIndex * itemHeight
    const bottomSpacer = virtualized
        ? Math.max(0, (items.length - range.end) * itemHeight)
        : 0

    return (
        <div ref={listRef} className={cn("min-w-0", className)}>
            {topSpacer > 0 ? <div aria-hidden style={{ height: topSpacer }} /> : null}
            {visibleItems.map((item, offset) => {
                const index = startIndex + offset
                return (
                    <div
                        key={getItemKey(item, index)}
                        style={{ height: itemHeight }}
                        data-virtual-index={index}
                    >
                        {renderItem(item, index)}
                    </div>
                )
            })}
            {bottomSpacer > 0 ? (
                <div aria-hidden style={{ height: bottomSpacer }} />
            ) : null}
        </div>
    )
}

export { VirtualList }
