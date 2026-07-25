import { ChevronLeft, ChevronRight } from "lucide-react"
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react"

import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel"
import { cn } from "@/lib/utils"

function chunkItems<T>(items: T[], size: number): T[][] {
    if (size <= 0) {
        return items.length > 0 ? [items] : []
    }
    const pages: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        pages.push(items.slice(i, i + size))
    }
    return pages
}

/** 区头左右按钮（依赖外部 embla api，避免外侧绝对定位被裁切） */
function RailControls({
    api,
    className,
}: {
    api: CarouselApi | undefined
    className?: string
}) {
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)

    const sync = useCallback((instance: CarouselApi | undefined) => {
        if (!instance) {
            setCanPrev(false)
            setCanNext(false)
            return
        }
        setCanPrev(instance.canScrollPrev())
        setCanNext(instance.canScrollNext())
    }, [])

    useEffect(() => {
        if (!api) {
            sync(undefined)
            return
        }
        sync(api)
        const onSelect = () => sync(api)
        api.on("select", onSelect)
        api.on("reInit", onSelect)
        return () => {
            api.off("select", onSelect)
            api.off("reInit", onSelect)
        }
    }, [api, sync])

    return (
        <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
            <button
                type="button"
                aria-label="上一页"
                disabled={!canPrev}
                onClick={() => api?.scrollPrev()}
                className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full",
                    "border border-black/[0.06] bg-black/[0.04] text-foreground",
                    "transition-[background-color,opacity,transform] duration-150",
                    "hover:bg-black/[0.08] active:scale-[0.96]",
                    "disabled:cursor-default disabled:opacity-30",
                    "dark:border-white/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
                )}
            >
                <ChevronLeft className="size-4" />
            </button>
            <button
                type="button"
                aria-label="下一页"
                disabled={!canNext}
                onClick={() => api?.scrollNext()}
                className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full",
                    "border border-black/[0.06] bg-black/[0.04] text-foreground",
                    "transition-[background-color,opacity,transform] duration-150",
                    "hover:bg-black/[0.08] active:scale-[0.96]",
                    "disabled:cursor-default disabled:opacity-30",
                    "dark:border-white/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
                )}
            >
                <ChevronRight className="size-4" />
            </button>
        </div>
    )
}

function useRailApi() {
    const [api, setApi] = useState<CarouselApi>()
    return { api, setApi }
}

type CardsRailProps = {
    children: ReactNode
    /** 卡宽；默认固定 152 */
    cardWidthClassName?: string
    className?: string
    setApi?: (api: CarouselApi | undefined) => void
}

/** 单行卡片横滑（为你推荐 / 播客） */
function CardsRail({
    children,
    cardWidthClassName = "w-[152px]",
    className,
    setApi,
}: CardsRailProps) {
    const items = Array.isArray(children) ? children : [children]

    return (
        <Carousel
            opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
            setApi={setApi}
            className={cn("w-full", className)}
        >
            <CarouselContent className="-ml-3">
                {items.map((child, index) => (
                    <CarouselItem
                        key={index}
                        className={cn("basis-auto pl-3", cardWidthClassName)}
                    >
                        {child}
                    </CarouselItem>
                ))}
            </CarouselContent>
        </Carousel>
    )
}

type GridPageRailProps<T> = {
    items: T[]
    cols: number
    getKey: (item: T, index: number) => string
    renderItem: (item: T, index: number) => ReactNode
    className?: string
    setApi?: (api: CarouselApi | undefined) => void
}

/** 每页 cols 张的分页横滑（更多歌单） */
function GridPageRail<T>({
    items,
    cols,
    getKey,
    renderItem,
    className,
    setApi,
}: GridPageRailProps<T>) {
    const pageSize = Math.max(1, cols)
    const pages = useMemo(
        () => chunkItems(items, pageSize),
        [items, pageSize],
    )

    return (
        <Carousel
            opts={{ align: "start", containScroll: "trimSnaps" }}
            setApi={setApi}
            className={cn("w-full", className)}
        >
            <CarouselContent className="-ml-0">
                {pages.map((page, pageIndex) => (
                    <CarouselItem
                        key={`page-${pageIndex}`}
                        className="basis-full pl-0"
                    >
                        <div
                            className="grid gap-3"
                            style={{
                                gridTemplateColumns: `repeat(${pageSize}, minmax(0, 1fr))`,
                            }}
                        >
                            {page.map((item, index) => {
                                const globalIndex = pageIndex * pageSize + index
                                return (
                                    <div key={getKey(item, globalIndex)}>
                                        {renderItem(item, globalIndex)}
                                    </div>
                                )
                            })}
                        </div>
                    </CarouselItem>
                ))}
            </CarouselContent>
        </Carousel>
    )
}

export { CardsRail, GridPageRail, RailControls, chunkItems, useRailApi }