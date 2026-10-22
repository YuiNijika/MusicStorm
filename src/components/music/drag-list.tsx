import { GripVertical } from "lucide-react"
import {
    useCallback,
    useRef,
    useState,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react"

import { VirtualList } from "@/components/music/virtual-list"
import { cn } from "@/lib/utils"

type DragListProps<T extends { id: string }> = {
    items: T[]
    enabled: boolean
    onReorder: (next: T[]) => void
    renderItem: (item: T, index: number, handle: ReactNode) => ReactNode
    className?: string
    itemHeight: number
    overscanPx?: number
    virtualizeAfter?: number
}

// 拖拽排序只在自定义排序视图启用，其余列表保持静止避免误触发
function DragList<T extends { id: string }>({
    items,
    enabled,
    onReorder,
    renderItem,
    className,
    itemHeight,
    overscanPx,
    virtualizeAfter,
}: DragListProps<T>) {
    const [dragId, setDragId] = useState<string | null>(null)
    const [overId, setOverId] = useState<string | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    const moveItem = useCallback(
        (fromId: string, toId: string) => {
            if (fromId === toId) {
                return false
            }
            const from = items.findIndex((item) => item.id === fromId)
            const to = items.findIndex((item) => item.id === toId)
            if (from < 0 || to < 0) {
                return false
            }
            const next = items.slice()
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            onReorder(next)
            return true
        },
        [items, onReorder],
    )

    const finish = useCallback(
        (fromId: string, toId: string | null) => {
            setDragId(null)
            setOverId(null)
            if (!toId) {
                return
            }
            moveItem(fromId, toId)
        },
        [moveItem],
    )

    function onHandlePointerDown(event: ReactPointerEvent, id: string) {
        if (!enabled) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        const target = event.currentTarget as HTMLElement
        target.setPointerCapture(event.pointerId)
        setDragId(id)
        setOverId(id)
    }

    function onHandlePointerMove(event: ReactPointerEvent) {
        if (!dragId) {
            return
        }
        const el = document.elementFromPoint(event.clientX, event.clientY)
        const row = el?.closest<HTMLElement>("[data-drag-id]")
        if (
            row?.dataset.dragId &&
            listRef.current?.contains(row)
        ) {
            setOverId(row.dataset.dragId)
        }
    }

    function onHandlePointerUp(event: ReactPointerEvent) {
        if (!dragId) {
            return
        }
        const target = event.currentTarget as HTMLElement
        try {
            target.releasePointerCapture(event.pointerId)
        } catch {
            // 指针捕获可能已丢失，无需处理
        }
        finish(dragId, overId)
    }

    function onHandleKeyDown(event: ReactKeyboardEvent, id: string) {
        if (
            !enabled ||
            !event.altKey ||
            (event.key !== "ArrowUp" && event.key !== "ArrowDown")
        ) {
            return
        }
        const current = items.findIndex((item) => item.id === id)
        const target = current + (event.key === "ArrowUp" ? -1 : 1)
        const targetItem = items[target]
        if (current < 0 || !targetItem) {
            return
        }
        event.preventDefault()
        moveItem(id, targetItem.id)
    }

    return (
        <div ref={listRef} className={className}>
            <VirtualList
                items={items}
                itemHeight={itemHeight}
                getItemKey={(item) => item.id}
                overscanPx={overscanPx}
                virtualizeAfter={virtualizeAfter}
                renderItem={(item, index) => {
                    const handle = enabled ? (
                        <button
                            type="button"
                            aria-label="拖动排序"
                            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                            title="拖动排序，也可按 Alt + ↑/↓ 调整"
                            className={cn(
                                "flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg",
                                "text-muted-foreground touch-none active:cursor-grabbing",
                                "transition-colors hover:bg-[var(--surface-fill)]",
                                dragId === item.id &&
                                    "cursor-grabbing text-foreground",
                            )}
                            onKeyDown={(event) =>
                                onHandleKeyDown(event, item.id)
                            }
                            onPointerDown={(event) =>
                                onHandlePointerDown(event, item.id)
                            }
                            onPointerMove={onHandlePointerMove}
                            onPointerUp={onHandlePointerUp}
                            onPointerCancel={onHandlePointerUp}
                        >
                            <GripVertical className="size-4" />
                        </button>
                    ) : null

                    return (
                        <div
                            data-drag-id={item.id}
                            className={cn(
                                // 被拖行压低并留虚线占位，目标行用主色示线标出落点
                                "h-full transition-[transform,opacity,box-shadow] duration-[var(--duration-control)]",
                                dragId === item.id &&
                                    "scale-[0.97] opacity-40 shadow-[var(--shadow-float)] outline-1 outline-dashed outline-foreground/25",
                                overId === item.id &&
                                    dragId &&
                                    dragId !== item.id &&
                                    "ring-1 ring-primary/50",
                            )}
                        >
                            {renderItem(item, index, handle)}
                        </div>
                    )
                }}
            />
        </div>
    )
}

export { DragList }
