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

    const visibleTop = Math.max(0, viewportTop - listRect.top - overscanPx)
    const visibleBottom = Math.min(
        itemCount * itemHeight,
        viewportBottom - listRect.top + overscanPx,
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

// 感知外层页面滚动的固定行高虚拟列表；overscan 避免快速滚动空白
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
    const frameRef = useRef<number | null>(null)
    const [range, setRange] = useState<VisibleRange>({
        start: 0,
        end: Math.min(items.length, virtualizeAfter),
    })
    const virtualized = items.length > virtualizeAfter

    const updateRange = useCallback(() => {
        if (!virtualized || !listRef.current) {
            setRange({ start: 0, end: items.length })
            return
        }
        const scrollParent = findScrollParent(listRef.current)
        const next = readVisibleRange(
            listRef.current,
            scrollParent,
            items.length,
            itemHeight,
            overscanPx,
        )
        setRange((current) =>
            current.start === next.start && current.end === next.end ? current : next,
        )
    }, [itemHeight, items.length, overscanPx, virtualized])

    const scheduleRangeUpdate = useCallback(() => {
        if (frameRef.current != null) {
            return
        }
        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            updateRange()
        })
    }, [updateRange])

    useLayoutEffect(() => {
        updateRange()
    }, [updateRange])

    useEffect(() => {
        const list = listRef.current
        if (!list || !virtualized) {
            return
        }
        const scrollParent = findScrollParent(list)
        const eventTarget = scrollParent === window ? window : scrollParent
        const observer = new ResizeObserver(scheduleRangeUpdate)

        eventTarget.addEventListener("scroll", scheduleRangeUpdate, { passive: true })
        window.addEventListener("resize", scheduleRangeUpdate, { passive: true })
        observer.observe(list)
        if (scrollParent !== window) {
            observer.observe(scrollParent as HTMLElement)
        }

        return () => {
            eventTarget.removeEventListener("scroll", scheduleRangeUpdate)
            window.removeEventListener("resize", scheduleRangeUpdate)
            observer.disconnect()
            if (frameRef.current != null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
        }
    }, [scheduleRangeUpdate, virtualized])

    const visibleItems = virtualized
        ? items.slice(range.start, range.end)
        : items
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