import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react"

type VariableVirtualListProps<T> = {
    items: T[]
    getItemKey: (item: T) => string
    renderItem: (item: T) => ReactNode
    estimatedItemHeight: number
    overscanPx?: number
    virtualizeAfter?: number
    focusRequest?: FocusRequest | null
    onFocusRequestHandled?: (requestId: number) => void
}

type ItemMeasurement = {
    height: number
    offset: number
}

type VisibleRange = {
    start: number
    end: number
}

type FocusRequest = {
    itemKey: string
    elementId: string
    requestId: number
}

type PreviousLayout = {
    keys: string[]
    measurements: ItemMeasurement[]
    measuredHeights: ReadonlyMap<string, number>
}

const DEFAULT_OVERSCAN_PX = 720
const DEFAULT_VIRTUALIZE_AFTER = 20
const MEASUREMENT_EPSILON = 0.5

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

function buildMeasurements(
    itemCount: number,
    measuredHeights: ReadonlyMap<string, number>,
    keys: string[],
    estimatedItemHeight: number,
): ItemMeasurement[] {
    const measurements: ItemMeasurement[] = []
    let offset = 0
    for (let index = 0; index < itemCount; index += 1) {
        const height =
            measuredHeights.get(keys[index] ?? "") ?? estimatedItemHeight
        measurements.push({ height, offset })
        offset += height
    }
    return measurements
}

function findItemAtOffset(
    measurements: ItemMeasurement[],
    offset: number,
): number {
    let low = 0
    let high = measurements.length - 1
    while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        const measurement = measurements[middle]
        if (!measurement) {
            return 0
        }
        if (offset < measurement.offset) {
            high = middle - 1
        } else if (offset >= measurement.offset + measurement.height) {
            low = middle + 1
        } else {
            return middle
        }
    }
    return Math.min(Math.max(0, low), Math.max(0, measurements.length - 1))
}

function readEntryHeight(entry: ResizeObserverEntry): number {
    return entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
}

// 评论高度随 Markdown 内容变化，不能复用固定行高的音乐列表
// 先按估算高度维持滚动条，挂载后再实测校正并保持当前滚动锚点
function VariableVirtualList<T>({
    items,
    getItemKey,
    renderItem,
    estimatedItemHeight,
    overscanPx = DEFAULT_OVERSCAN_PX,
    virtualizeAfter = DEFAULT_VIRTUALIZE_AFTER,
    focusRequest = null,
    onFocusRequestHandled,
}: VariableVirtualListProps<T>) {
    const listRef = useRef<HTMLDivElement>(null)
    const scrollParentRef = useRef<HTMLElement | Window | null>(null)
    const frameRef = useRef<number | null>(null)
    const previousLayoutRef = useRef<PreviousLayout | null>(null)
    const keys = useMemo(() => items.map(getItemKey), [getItemKey, items])
    const keyIndexes = useMemo(
        () => new Map(keys.map((key, index) => [key, index])),
        [keys],
    )
    const virtualized = items.length > virtualizeAfter
    const initialWindowLength = Math.min(
        items.length,
        Math.max(1, Math.ceil(DEFAULT_OVERSCAN_PX / estimatedItemHeight)),
    )
    const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(
        () => new Map(),
    )
    const [range, setRange] = useState<VisibleRange>(() => ({
        start: 0,
        end: virtualized ? initialWindowLength : items.length,
    }))
    const measurements = useMemo(
        () =>
            buildMeasurements(
                items.length,
                measuredHeights,
                keys,
                estimatedItemHeight,
            ),
        [estimatedItemHeight, items.length, keys, measuredHeights],
    )

    const updateRange = useCallback(() => {
        const list = listRef.current
        if (!list) {
            return
        }
        if (!virtualized) {
            setRange({ start: 0, end: items.length })
            return
        }
        if (!scrollParentRef.current) {
            scrollParentRef.current = findScrollParent(list)
        }
        const scrollParent = scrollParentRef.current
        const listRect = list.getBoundingClientRect()
        const viewportTop =
            scrollParent === window
                ? 0
                : (scrollParent as HTMLElement).getBoundingClientRect().top
        const viewportBottom =
            scrollParent === window
                ? window.innerHeight
                : (scrollParent as HTMLElement).getBoundingClientRect().bottom
        const effectiveOverscan = Math.max(overscanPx, viewportBottom - viewportTop)
        const visibleTop = Math.max(
            0,
            viewportTop - listRect.top - effectiveOverscan,
        )
        const visibleBottom =
            viewportBottom - listRect.top + effectiveOverscan

        const focusIndex = focusRequest
            ? keyIndexes.get(focusRequest.itemKey)
            : undefined
        if (focusIndex !== undefined) {
            const start = Math.max(
                0,
                Math.min(focusIndex, items.length - initialWindowLength),
            )
            setRange({
                start,
                end: Math.min(items.length, start + initialWindowLength),
            })
            return
        }

        const start = findItemAtOffset(measurements, visibleTop)
        const endCandidate = findItemAtOffset(
            measurements,
            Math.max(0, visibleBottom),
        )
        const end = Math.min(
            items.length,
            Math.max(start + 1, endCandidate + 1),
        )
        setRange((current) =>
            current.start === start && current.end === end
                ? current
                : { start, end },
        )
    }, [
        focusRequest,
        initialWindowLength,
        items.length,
        keyIndexes,
        measurements,
        overscanPx,
        virtualized,
    ])

    const scheduleRangeUpdate = useCallback(() => {
        if (frameRef.current !== null) {
            return
        }
        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            updateRange()
        })
    }, [updateRange])

    useLayoutEffect(() => {
        const list = listRef.current
        if (!list) {
            return
        }
        scrollParentRef.current = null
        updateRange()
    }, [updateRange, virtualized])

    useLayoutEffect(() => {
        const list = listRef.current
        if (!virtualized || !list) {
            return
        }
        const observer = new ResizeObserver((entries) => {
            const next = new Map<string, number>()
            for (const entry of entries) {
                const index = Number(
                    (entry.target as HTMLElement).dataset.feedbackThread,
                )
                const key = keys[index]
                if (key) {
                    next.set(key, readEntryHeight(entry))
                }
            }
            setMeasuredHeights((current) => {
                let changed = false
                const updated = new Map(current)
                for (const [key, height] of next) {
                    if (
                        Math.abs((current.get(key) ?? 0) - height) >
                        MEASUREMENT_EPSILON
                    ) {
                        updated.set(key, height)
                        changed = true
                    }
                }
                const activeKeys = new Set(keys)
                for (const key of updated.keys()) {
                    if (!activeKeys.has(key)) {
                        updated.delete(key)
                        changed = true
                    }
                }
                return changed ? updated : current
            })
        })
        for (const item of list.querySelectorAll<HTMLElement>(
            "[data-feedback-thread]",
        )) {
            observer.observe(item)
        }
        return () => observer.disconnect()
    }, [keys, range.start, range.end, virtualized])

    useEffect(() => {
        const activeKeys = new Set(keys)
        setMeasuredHeights((current) => {
            let changed = false
            const updated = new Map(current)
            for (const key of updated.keys()) {
                if (!activeKeys.has(key)) {
                    updated.delete(key)
                    changed = true
                }
            }
            return changed ? updated : current
        })
    }, [keys])

    useLayoutEffect(() => {
        const previous = previousLayoutRef.current
        const anchorKey = keys[range.start]
        if (
            previous &&
            previous.measuredHeights !== measuredHeights &&
            anchorKey
        ) {
            const previousIndex = previous.keys.indexOf(anchorKey)
            const previousOffset =
                previous.measurements[previousIndex]?.offset
            const currentOffset = measurements[range.start]?.offset
            if (
                previousOffset !== undefined &&
                currentOffset !== undefined &&
                Math.abs(currentOffset - previousOffset) > MEASUREMENT_EPSILON
            ) {
                const list = listRef.current
                if (list) {
                    if (!scrollParentRef.current) {
                        scrollParentRef.current = findScrollParent(list)
                    }
                    const delta = currentOffset - previousOffset
                    if (scrollParentRef.current === window) {
                        window.scrollBy(0, delta)
                    } else {
                        const scrollParent =
                            scrollParentRef.current as HTMLElement
                        scrollParent.scrollTop += delta
                    }
                }
            }
        }
        previousLayoutRef.current = {
            keys,
            measurements,
            measuredHeights,
        }
    }, [keys, measuredHeights, measurements, range.start])

    useLayoutEffect(() => {
        const list = listRef.current
        if (!list) {
            return
        }
        if (!virtualized) {
            setRange({ start: 0, end: items.length })
            return
        }
        const scrollParent = findScrollParent(list)
        const eventTarget = scrollParent === window ? window : scrollParent
        const observer = new ResizeObserver(scheduleRangeUpdate)
        eventTarget.addEventListener("scroll", scheduleRangeUpdate, {
            passive: true,
        })
        window.addEventListener("resize", scheduleRangeUpdate, { passive: true })
        observer.observe(list)
        if (scrollParent !== window) {
            observer.observe(scrollParent as HTMLElement)
        }
        scheduleRangeUpdate()
        return () => {
            eventTarget.removeEventListener("scroll", scheduleRangeUpdate)
            window.removeEventListener("resize", scheduleRangeUpdate)
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
            observer.disconnect()
        }
    }, [items.length, scheduleRangeUpdate, virtualized])

    useLayoutEffect(() => {
        const request = focusRequest
        if (!request) {
            return
        }
        const itemIndex = keyIndexes.get(request.itemKey)
        if (itemIndex === undefined) {
            onFocusRequestHandled?.(request.requestId)
            return
        }
        if (virtualized && (itemIndex < range.start || itemIndex >= range.end)) {
            const start = Math.max(
                0,
                Math.min(itemIndex, items.length - initialWindowLength),
            )
            setRange({
                start,
                end: Math.min(items.length, start + initialWindowLength),
            })
            return
        }
        const target = document.getElementById(request.elementId)
        if (!target || !listRef.current?.contains(target)) {
            onFocusRequestHandled?.(request.requestId)
            return
        }
        target.focus({ preventScroll: true })
        target.scrollIntoView({
            behavior: "auto",
            block: "center",
        })
        onFocusRequestHandled?.(request.requestId)
    }, [
        focusRequest,
        initialWindowLength,
        items.length,
        keyIndexes,
        onFocusRequestHandled,
        range.end,
        range.start,
        virtualized,
    ])

    if (!virtualized) {
        return (
            <div ref={listRef} className="feedback-threads">
                {items.map((item, index) => (
                    <div key={keys[index]} data-feedback-thread={index}>
                        {renderItem(item)}
                    </div>
                ))}
            </div>
        )
    }

    const startIndex = Math.min(range.start, Math.max(0, items.length - 1))
    const endIndex = Math.max(startIndex + 1, Math.min(range.end, items.length))
    const topSpacer = measurements[startIndex]?.offset ?? 0
    const lastMeasurement = measurements[endIndex - 1]
    const bottomSpacer = lastMeasurement
        ? Math.max(
              0,
              (measurements[measurements.length - 1]?.offset ?? 0) +
                  (measurements[measurements.length - 1]?.height ?? 0) -
                  (lastMeasurement.offset + lastMeasurement.height),
          )
        : 0

    return (
        <div ref={listRef} className="feedback-threads">
            {topSpacer > 0 ? <div aria-hidden style={{ height: topSpacer }} /> : null}
            {items.slice(startIndex, endIndex).map((item, offset) => {
                const index = startIndex + offset
                return (
                    <div
                        key={keys[index]}
                        data-feedback-thread={index}
                    >
                        {renderItem(item)}
                    </div>
                )
            })}
            {bottomSpacer > 0 ? (
                <div aria-hidden style={{ height: bottomSpacer }} />
            ) : null}
        </div>
    )
}

export { VariableVirtualList }
export type { FocusRequest }
