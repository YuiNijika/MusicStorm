import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type VirtualGridProps<T> = {
    items: T[]
    columns: number
    estimatedRowHeight: number
    renderItem: (item: T, index: number) => ReactNode
    getItemKey: (item: T, index: number) => string
    className?: string
    columnGap?: number
    rowGap?: number
    overscanRows?: number
    virtualizeAfter?: number
}

type VisibleRowRange = {
    start: number
    end: number
}

const DEFAULT_COLUMN_GAP = 12
const DEFAULT_ROW_GAP = 12
const DEFAULT_OVERSCAN_ROWS = 3
const DEFAULT_VIRTUALIZE_AFTER = 30
const MIN_ROW_HEIGHT = 1
const INITIAL_RENDER_ROWS = 6

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

function readVisibleRows(
    grid: HTMLElement,
    scrollParent: HTMLElement | Window,
    rowCount: number,
    rowHeight: number,
    rowGap: number,
    overscanRows: number,
): VisibleRowRange {
    const gridRect = grid.getBoundingClientRect()
    const viewportTop =
        scrollParent === window
            ? 0
            : (scrollParent as HTMLElement).getBoundingClientRect().top
    const viewportBottom =
        scrollParent === window
            ? window.innerHeight
            : (scrollParent as HTMLElement).getBoundingClientRect().bottom
    const rowStride = rowHeight + rowGap
    const viewportRows = Math.max(
        1,
        Math.ceil(Math.max(0, viewportBottom - viewportTop) / rowStride),
    )
    const effectiveOverscan = Math.max(overscanRows, viewportRows)
    const visibleTop = Math.max(
        0,
        viewportTop - gridRect.top - effectiveOverscan * rowStride,
    )
    const listHeight = Math.max(
        0,
        rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap,
    )
    const visibleBottom = Math.min(
        listHeight,
        viewportBottom - gridRect.top + effectiveOverscan * rowStride,
    )
    const start = Math.min(
        Math.max(0, rowCount - 1),
        Math.max(0, Math.floor(visibleTop / rowStride)),
    )
    const end = Math.min(
        rowCount,
        Math.max(start + 1, Math.ceil(Math.max(0, visibleBottom) / rowStride)),
    )

    return { start, end }
}

function initialRange(rowCount: number, virtualized: boolean): VisibleRowRange {
    return {
        start: 0,
        end: virtualized ? Math.min(rowCount, INITIAL_RENDER_ROWS) : rowCount,
    }
}

function VirtualGrid<T>({
    items,
    columns,
    estimatedRowHeight,
    renderItem,
    getItemKey,
    className,
    columnGap = DEFAULT_COLUMN_GAP,
    rowGap = DEFAULT_ROW_GAP,
    overscanRows = DEFAULT_OVERSCAN_ROWS,
    virtualizeAfter = DEFAULT_VIRTUALIZE_AFTER,
}: VirtualGridProps<T>) {
    const gridRef = useRef<HTMLDivElement>(null)
    const scrollParentRef = useRef<HTMLElement | Window | null>(null)
    const frameRef = useRef<number | null>(null)
    const [measuredRowHeight, setMeasuredRowHeight] = useState(0)
    const safeColumns = Math.max(1, Math.floor(columns))
    const rowCount = Math.ceil(items.length / safeColumns)
    const virtualized = items.length > virtualizeAfter
    const [range, setRange] = useState<VisibleRowRange>(() =>
        initialRange(rowCount, virtualized),
    )
    const rowHeight = Math.max(
        MIN_ROW_HEIGHT,
        measuredRowHeight || estimatedRowHeight,
    )
    const rowStride = rowHeight + rowGap

    const measureRow = useCallback(() => {
        const firstRow =
            gridRef.current?.querySelector<HTMLElement>("[data-virtual-row]")
        if (!firstRow) {
            return
        }
        const nextHeight = firstRow.getBoundingClientRect().height
        if (nextHeight <= 0) {
            return
        }
        setMeasuredRowHeight((current) =>
            Math.abs(current - nextHeight) < 0.5 ? current : nextHeight,
        )
    }, [])

    const updateRange = useCallback(() => {
        const grid = gridRef.current
        if (!grid) {
            return
        }
        if (!scrollParentRef.current) {
            scrollParentRef.current = findScrollParent(grid)
        }
        const next = readVisibleRows(
            grid,
            scrollParentRef.current,
            rowCount,
            rowHeight,
            rowGap,
            overscanRows,
        )
        setRange((current) =>
            current.start === next.start && current.end === next.end
                ? current
                : next,
        )
    }, [overscanRows, rowCount, rowGap, rowHeight])

    const scheduleUpdate = useCallback(() => {
        if (frameRef.current !== null) {
            return
        }
        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            measureRow()
            updateRange()
        })
    }, [measureRow, updateRange])

    useLayoutEffect(() => {
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current)
            frameRef.current = null
        }
        scrollParentRef.current = null
        setRange(initialRange(rowCount, virtualized))
        measureRow()
        updateRange()
    }, [
        columns,
        measureRow,
        rowCount,
        updateRange,
        virtualized,
    ])

    useEffect(() => {
        if (!virtualized) {
            return
        }
        const grid = gridRef.current
        if (!grid) {
            return
        }
        const scrollParent = findScrollParent(grid)
        const eventTarget = scrollParent === window ? window : scrollParent
        const observer = new ResizeObserver(scheduleUpdate)

        eventTarget.addEventListener("scroll", scheduleUpdate, { passive: true })
        window.addEventListener("resize", scheduleUpdate, { passive: true })
        observer.observe(grid)
        if (scrollParent !== window) {
            observer.observe(scrollParent as HTMLElement)
        }

        return () => {
            eventTarget.removeEventListener("scroll", scheduleUpdate)
            window.removeEventListener("resize", scheduleUpdate)
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
            observer.disconnect()
        }
    }, [scheduleUpdate, virtualized])

    const startRow = virtualized ? range.start : 0
    const endRow = virtualized ? range.end : rowCount
    const renderedRows = Array.from(
        { length: Math.max(0, endRow - startRow) },
        (_, offset) => startRow + offset,
    )
    const containerStyle: CSSProperties = {
        position: "relative",
        height: Math.max(
            0,
            rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap,
        ),
        overflowAnchor: "none",
    }

    return (
        <div
            ref={gridRef}
            className={cn("min-w-0", className)}
            style={containerStyle}
            data-virtual-grid={virtualized ? "true" : "false"}
        >
            {renderedRows.map((rowIndex) => {
                const startIndex = rowIndex * safeColumns
                const rowItems = items.slice(startIndex, startIndex + safeColumns)
                return (
                    <div
                        key={`row-${rowIndex}`}
                        className="grid min-w-0"
                        style={{
                            position: "absolute",
                            top: rowIndex * rowStride,
                            left: 0,
                            right: 0,
                            gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
                            columnGap,
                        }}
                        data-virtual-row={rowIndex}
                    >
                        {rowItems.map((item, offset) => {
                            const index = startIndex + offset
                            return (
                                <div
                                    key={getItemKey(item, index)}
                                    className="min-w-0"
                                    data-virtual-index={index}
                                >
                                    {renderItem(item, index)}
                                </div>
                            )
                        })}
                    </div>
                )
            })}
        </div>
    )
}

export { VirtualGrid }
