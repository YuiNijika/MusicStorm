import { GripVertical } from "lucide-react"
import {
    useCallback,
    useRef,
    useState,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
} from "react"

import { cn } from "@/lib/utils"

type DragListProps<T extends { id: string }> = {
    items: T[]
    enabled: boolean
    onReorder: (next: T[]) => void
    renderItem: (item: T, index: number, handle: ReactNode) => ReactNode
    className?: string
}

// 轻量指针拖拽排序：按住 Grip 拖动；仅 list 视图 / 自定义排序时启用
function DragList<T extends { id: string }>({
    items,
    enabled,
    onReorder,
    renderItem,
    className,
}: DragListProps<T>) {
    const [dragId, setDragId] = useState<string | null>(null)
    const [overId, setOverId] = useState<string | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    const finish = useCallback(
        (fromId: string, toId: string | null) => {
            setDragId(null)
            setOverId(null)
            if (!toId || fromId === toId) {
                return
            }
            const from = items.findIndex((item) => item.id === fromId)
            const to = items.findIndex((item) => item.id === toId)
            if (from < 0 || to < 0) {
                return
            }
            const next = items.slice()
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            onReorder(next)
        },
        [items, onReorder],
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
        if (!dragId || !listRef.current) {
            return
        }
        const el = document.elementFromPoint(event.clientX, event.clientY)
        const row = el?.closest<HTMLElement>("[data-drag-id]")
        if (row?.dataset.dragId) {
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

    return (
        <div ref={listRef} className={className}>
            {items.map((item, index) => {
                const handle = enabled ? (
                    <button
                        type="button"
                        aria-label="拖动排序"
                        title="拖动排序"
                        className={cn(
                            "flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg",
                            "text-muted-foreground touch-none active:cursor-grabbing",
                            "hover:bg-black/[0.05] dark:hover:bg-white/[0.08]",
                            dragId === item.id && "cursor-grabbing text-foreground",
                        )}
                        onPointerDown={(e) => onHandlePointerDown(e, item.id)}
                        onPointerMove={onHandlePointerMove}
                        onPointerUp={onHandlePointerUp}
                        onPointerCancel={onHandlePointerUp}
                    >
                        <GripVertical className="size-4" />
                    </button>
                ) : null

                return (
                    <div
                        key={item.id}
                        data-drag-id={item.id}
                        className={cn(
                            "transition-opacity",
                            dragId === item.id && "opacity-60",
                            overId === item.id &&
                                dragId &&
                                dragId !== item.id &&
                                "ring-1 ring-primary/40 rounded-xl",
                        )}
                    >
                        {renderItem(item, index, handle)}
                    </div>
                )
            })}
        </div>
    )
}

export { DragList }