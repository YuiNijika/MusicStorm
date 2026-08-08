import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
} from "react"

import { cn } from "@/lib/utils"

// 与移动端顶部导航同款的文字分段控制器：
// 单行时激活项用白色胶囊滑动指示器（spring 追踪），
// 容器放不下自动换行 → 降级为静态白底胶囊（滑动指示器跨行无意义）。
type SegmentedItem = {
    id: string
    label: string
}

type SegmentedControlProps = {
    items: SegmentedItem[]
    value: string
    onChange: (id: string) => void
    className?: string
}

function SegmentedControl({
    items,
    value,
    onChange,
    className,
}: SegmentedControlProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const activeRef = useRef<HTMLButtonElement>(null)
    const [indicator, setIndicator] = useState<{
        left: number
        width: number
        enabled: boolean
    }>({ left: 0, width: 0, enabled: false })

    const sync = useCallback(() => {
        const container = containerRef.current
        const active = activeRef.current
        if (!container || !active) {
            return
        }
        const singleLine =
            container.scrollWidth <= container.clientWidth + 1
        if (!singleLine) {
            setIndicator((prev) => ({ ...prev, enabled: false }))
            return
        }
        const cRect = container.getBoundingClientRect()
        const aRect = active.getBoundingClientRect()
        setIndicator({
            left: aRect.left - cRect.left,
            width: aRect.width,
            enabled: true,
        })
    }, [])

    useLayoutEffect(() => {
        sync()
        // 容器尺寸变化时重算
        const container = containerRef.current
        if (!container) {
            return
        }
        const observer = new ResizeObserver(sync)
        observer.observe(container)
        return () => observer.disconnect()
    }, [sync, value])

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative flex flex-wrap gap-1 rounded-full bg-foreground/[0.06] p-1",
                className,
            )}
        >
            {items.map((item) => {
                const active = item.id === value
                return (
                    <button
                        key={item.id}
                        type="button"
                        ref={active ? activeRef : undefined}
                        onClick={() => onChange(item.id)}
                        className={cn(
                            "relative z-[1] cursor-pointer rounded-full px-3.5 py-1.5",
                            "text-[13px] font-medium transition-colors duration-150",
                            "active:scale-[0.97]",
                            active
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {item.label}
                    </button>
                )
            })}
            {/* 滑动指示器仅单行时启用，跟手用 CSS transition与 navbar 一致 */}
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none absolute inset-y-1 rounded-full bg-background shadow-sm",
                    "ring-1 ring-black/[0.06] dark:ring-white/[0.1]",
                    !indicator.enabled && "opacity-0",
                )}
                style={{
                    left: indicator.left,
                    width: indicator.width,
                    transition: indicator.enabled
                        ? "left var(--duration-enter) var(--ease-enter), width var(--duration-enter) var(--ease-enter), opacity 150ms var(--ease-enter)"
                        : "opacity 150ms var(--ease-enter)",
                }}
            />
        </div>
    )
}

export { SegmentedControl }
export type { SegmentedItem }
