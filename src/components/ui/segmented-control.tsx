import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
} from "react"

import { cn } from "@/lib/utils"

// 与移动端顶部导航同款的文字分段控制器：
// 恒单行（不换行），容器放不下时横向滚动，
// 激活项用白色胶囊滑动指示器（spring 追踪，滚动时跟随）。
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
    const [indicator, setIndicator] = useState({
        left: 0,
        width: 0,
    })

    const sync = useCallback(() => {
        const container = containerRef.current
        const active = activeRef.current
        if (!container || !active) {
            return
        }
        const cRect = container.getBoundingClientRect()
        const aRect = active.getBoundingClientRect()
        setIndicator({
            left: aRect.left - cRect.left,
            width: aRect.width,
        })
    }, [])

    useLayoutEffect(() => {
        sync()
        // 激活项切换或容器尺寸变化时，保证选中项可见
        const container = containerRef.current
        const active = activeRef.current
        if (container && active) {
            const left = active.offsetLeft
            const right = left + active.offsetWidth
            if (left < container.scrollLeft) {
                container.scrollLeft = left
            } else if (right > container.scrollLeft + container.clientWidth) {
                container.scrollLeft = right - container.clientWidth
            }
        }
        const observer = new ResizeObserver(sync)
        if (container) {
            observer.observe(container)
        }
        return () => observer.disconnect()
    }, [sync, value])

    return (
        <div
            ref={containerRef}
            onScroll={sync}
            className={cn(
                "relative flex flex-nowrap gap-1 overflow-x-auto rounded-full bg-foreground/[0.06] p-1",
                // 隐藏滚动条：横向 tab 滚动不应暴露系统滚动条
                "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
                            "relative z-[1] cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5",
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
            {/* 滑动指示器：跟随激活项，spring 过渡与顶部 navbar 一致 */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-y-1 rounded-full bg-background shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.1]"
                style={{
                    left: indicator.left,
                    width: indicator.width,
                    transition:
                        "left var(--duration-enter) var(--ease-enter), width var(--duration-enter) var(--ease-enter)",
                }}
            />
        </div>
    )
}

export { SegmentedControl }
export type { SegmentedItem }
