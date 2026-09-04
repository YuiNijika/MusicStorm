import type { CSSProperties, Ref } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { useIsMobile } from "@/hooks/use-mobile"
import { PLAYLIST_GRID_CLASS } from "@/hooks/use-playlist-grid"
import { cn } from "@/lib/utils"

function PlaylistGridSkeleton({
    count = 4,
    className,
    style,
    gridRef,
}: {
    count?: number
    className?: string
    style?: CSSProperties
    gridRef?: Ref<HTMLDivElement>
}) {
    const isMobile = useIsMobile()
    return (
        <div
            ref={gridRef}
            className={cn(PLAYLIST_GRID_CLASS, className)}
            style={
                style ?? {
                    gridTemplateColumns: `repeat(${Math.min(Math.max(count, 3), 5)}, minmax(0, 1fr))`,
                }
            }
            aria-busy
            aria-label="加载中"
        >
            {Array.from({ length: count }, (_, index) => (
                <div
                    key={index}
                    className="material-surface flex flex-col gap-3 rounded-[22px] p-3"
                >
                    <Skeleton className="aspect-square w-full rounded-2xl" />
                    <div className="space-y-2 px-0.5">
                        <Skeleton className={cn("rounded-full", isMobile ? "h-4 w-[82%]" : "h-3.5 w-[78%]")} />
                        <Skeleton className={cn("rounded-full", isMobile ? "h-3.5 w-[48%]" : "h-3 w-[42%]")} />
                    </div>
                </div>
            ))}
        </div>
    )
}

function TrackListSkeleton({
    count = 6,
    indexed = false,
}: {
    count?: number
    indexed?: boolean
}) {
    const isMobile = useIsMobile()
    return (
        <div
            className="apple-list-surface space-y-1 p-1.5"
            aria-busy
            aria-label="加载中"
        >
            {Array.from({ length: count }, (_, index) => (
                <div
                    key={index}
                    className={cn(
                        "grid items-center gap-3 rounded-2xl",
                        isMobile ? "px-3 py-3" : "px-3 py-2",
                        indexed
                            ? "grid-cols-[auto_auto_minmax(0,1fr)_auto]"
                            : "grid-cols-[auto_minmax(0,1fr)_auto]",
                    )}
                >
                    {indexed ? (
                        <Skeleton className="h-3 w-5 rounded-full" />
                    ) : null}
                    <Skeleton className={cn("shrink-0 rounded-xl", isMobile ? "size-12" : "size-11")} />
                    <div className="min-w-0 space-y-2">
                        <Skeleton
                            className={cn(
                                isMobile ? "h-4" : "h-3.5",
                                "rounded-full",
                                index % 3 === 0
                                    ? "w-[72%]"
                                    : index % 3 === 1
                                      ? "w-[58%]"
                                      : "w-[66%]",
                            )}
                        />
                        <Skeleton
                            className={cn(
                                isMobile ? "h-3.5" : "h-3",
                                "rounded-full",
                                index % 2 === 0 ? "w-[40%]" : "w-[48%]",
                            )}
                        />
                    </div>
                    <Skeleton className="h-3 w-8 rounded-full" />
                </div>
            ))}
        </div>
    )
}

function DetailHeroSkeleton({
    coverShape = "rounded",
}: {
    coverShape?: "rounded" | "circle"
}) {
    return (
        <div className="flex flex-wrap items-end gap-5" aria-busy>
            <Skeleton
                className={cn(
                    "size-36 shrink-0 shadow-sm",
                    coverShape === "circle" ? "rounded-full" : "rounded-[24px]",
                )}
            />
            <div className="min-w-0 flex-1 space-y-3 pb-1">
                <Skeleton className="h-3.5 w-14 rounded-full" />
                <Skeleton className="h-8 w-[min(280px,70%)] rounded-full" />
                <Skeleton className="h-3.5 w-[min(180px,45%)] rounded-full" />
                <Skeleton className="mt-1 h-9 w-24 rounded-full" />
            </div>
        </div>
    )
}

function DetailPageSkeleton({
    coverShape = "rounded",
}: {
    coverShape?: "rounded" | "circle"
}) {
    return (
        <div className="space-y-6" aria-busy aria-label="加载中">
            <DetailHeroSkeleton coverShape={coverShape} />
            <div className="space-y-3">
                <Skeleton className="h-6 w-24 rounded-full" />
                <TrackListSkeleton count={8} />
            </div>
        </div>
    )
}

function DailyColumnsSkeleton({ columns = 3 }: { columns?: number }) {
    return (
        <div
            className="grid grid-cols-1 gap-3 lg:grid-cols-3"
            aria-busy
            aria-label="加载中"
        >
            {Array.from({ length: columns }).map((_, index) => (
                <div
                    key={index}
                    className="apple-list-surface p-2"
                >
                    <TrackListSkeleton count={8} />
                </div>
            ))}
        </div>
    )
}

function LyricsSkeleton({ variant = "full" }: { variant?: "compact" | "full" }) {
    const widths =
        variant === "full"
            ? ["88%", "72%", "94%", "64%", "80%", "56%", "90%"]
            : ["70%", "55%", "78%", "48%"]

    return (
        <div
            className={cn(
                "mx-auto flex w-full flex-col",
                variant === "full" ? "max-w-[360px] gap-4" : "max-w-[420px] items-center gap-3",
            )}
            aria-hidden
        >
            {widths.map((width, index) => (
                <Skeleton
                    key={index}
                    className={cn(
                        "rounded-full",
                        variant === "full" ? "h-5" : "h-3.5",
                        variant === "compact" && "mx-auto",
                    )}
                    style={{ width }}
                />
            ))}
        </div>
    )
}

function SearchResultsSkeleton() {
    return <TrackListSkeleton count={8} />
}

function StatsPageSkeleton() {
    return (
        <div className="space-y-8" aria-busy aria-label="加载中">
            {/* 总览主卡：眉标 + 大数字 + 底部数据带 */}
            <div className="material-surface overflow-hidden rounded-[22px]">
                <div className="p-6 sm:p-8">
                    <Skeleton className="h-7 w-28 rounded-full" />
                    <div className="mt-4 flex items-end gap-3">
                        <Skeleton className="h-[56px] w-24 rounded-[16px] sm:h-[72px] sm:w-32" />
                        <Skeleton className="mb-1 h-8 w-24 rounded-full" />
                    </div>
                </div>
                <div className="grid grid-cols-2 border-t border-[var(--separator)] sm:grid-cols-4">
                    {Array.from({ length: 4 }, (_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "px-6 py-4 sm:px-8 sm:py-5",
                                i === 1 &&
                                    "border-l border-[var(--separator)]",
                                i === 2 &&
                                    "border-t border-[var(--separator)] sm:border-t-0 sm:border-l",
                                i === 3 &&
                                    "border-l border-t border-[var(--separator)] sm:border-t-0",
                            )}
                        >
                            <Skeleton className="h-3 w-11 rounded-full" />
                            <Skeleton className="mt-2.5 h-4 w-14 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>

            {/* 概览 bento：7 比 5 两行 */}
            <div className="grid gap-4 lg:grid-cols-12">
                <Skeleton className="h-[252px] w-full rounded-[22px] lg:col-span-7" />
                <Skeleton className="h-[252px] w-full rounded-[22px] lg:col-span-5" />
                <Skeleton className="h-[252px] w-full rounded-[22px] lg:col-span-7" />
                <Skeleton className="h-[252px] w-full rounded-[22px] lg:col-span-5" />
            </div>

            {/* 常听列表 */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-10 w-full rounded-full" />
                <TrackListSkeleton count={6} indexed />
            </div>
        </div>
    )
}

function PlaylistDetailSkeleton() {
    return (
        <div className="space-y-6" aria-busy aria-label="歌单加载中">
            <div className="flex flex-wrap items-end gap-5">
                <Skeleton className="size-36 shrink-0 rounded-[24px] shadow-sm" />
                <div className="min-w-0 flex-1 space-y-2.5 pb-1">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-12 rounded-full" />
                        <Skeleton className="h-3.5 w-14 rounded-full" />
                    </div>
                    <Skeleton className="h-8 w-[min(300px,75%)] rounded-full" />
                    <div className="space-y-2 pt-0.5">
                        <Skeleton className="h-3 w-[min(420px,90%)] rounded-full" />
                        <Skeleton className="h-3 w-[min(320px,68%)] rounded-full" />
                    </div>
                    <Skeleton className="mt-2 h-9 w-28 rounded-[10px]" />
                </div>
            </div>
            <TrackListSkeleton count={8} indexed />
        </div>
    )
}

function AlbumDetailSkeleton() {
    return (
        <div className="space-y-6" aria-busy aria-label="专辑加载中">
            <div className="flex flex-wrap items-end gap-5">
                <Skeleton className="size-36 shrink-0 rounded-[24px] shadow-sm" />
                <div className="min-w-0 flex-1 space-y-2.5 pb-1">
                    <Skeleton className="h-3.5 w-10 rounded-full" />
                    <Skeleton className="h-8 w-[min(280px,72%)] rounded-full" />
                    <div className="flex gap-3">
                        <Skeleton className="h-3.5 w-24 rounded-full" />
                        <Skeleton className="h-3.5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="mt-1 h-9 w-28 rounded-[10px]" />
                </div>
            </div>
            <TrackListSkeleton count={8} />
        </div>
    )
}

function ArtistDetailSkeleton() {
    return (
        <div className="space-y-6" aria-busy aria-label="歌手加载中">
            <div className="flex flex-wrap items-end gap-5">
                <Skeleton className="size-36 shrink-0 rounded-full shadow-sm" />
                <div className="min-w-0 flex-1 space-y-2.5 pb-1">
                    <Skeleton className="h-3.5 w-10 rounded-full" />
                    <Skeleton className="h-9 w-[min(300px,70%)] rounded-full" />
                    <Skeleton className="h-3.5 w-[min(220px,50%)] rounded-full" />
                    <Skeleton className="mt-1 h-9 w-28 rounded-[10px]" />
                </div>
            </div>
            <div className="flex gap-5 border-b border-black/[0.06] pb-2.5 dark:border-white/[0.08]">
                {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton
                        key={i}
                        className={cn("h-4 rounded-full", i === 0 ? "w-14" : "w-10")}
                    />
                ))}
            </div>
            <TrackListSkeleton count={6} indexed />
            <div className="space-y-3">
                <Skeleton className="h-6 w-16 rounded-full" />
                <PlaylistGridSkeleton count={4} />
            </div>
        </div>
    )
}

function RadioDetailSkeleton() {
    return (
        <div className="space-y-6" aria-busy aria-label="电台加载中">
            <div className="flex flex-wrap items-end gap-5">
                <Skeleton className="size-36 shrink-0 rounded-[24px] shadow-sm" />
                <div className="min-w-0 flex-1 space-y-2.5 pb-1">
                    <Skeleton className="h-3.5 w-10 rounded-full" />
                    <Skeleton className="h-8 w-[min(280px,72%)] rounded-full" />
                    <div className="flex gap-3">
                        <Skeleton className="h-3.5 w-28 rounded-full" />
                        <Skeleton className="h-3.5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-[min(420px,88%)] rounded-full" />
                    <div className="flex gap-2 pt-1">
                        <Skeleton className="h-9 w-24 rounded-[10px]" />
                        <Skeleton className="h-9 w-20 rounded-full" />
                    </div>
                </div>
            </div>
            <TrackListSkeleton count={8} />
        </div>
    )
}

function RadioProgramDetailSkeleton() {
    return (
        <div className="space-y-6" aria-busy aria-label="电台节目加载中">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                <Skeleton className="size-40 shrink-0 rounded-[26px] shadow-sm sm:size-44" />
                <div className="min-w-0 flex-1 space-y-2.5 pb-0.5">
                    <Skeleton className="h-3.5 w-16 rounded-full" />
                    <Skeleton className="h-8 w-[min(320px,82%)] rounded-full" />
                    <div className="flex gap-3">
                        <Skeleton className="h-3.5 w-28 rounded-full" />
                        <Skeleton className="h-3.5 w-20 rounded-full" />
                    </div>
                    <div className="space-y-2 pt-0.5">
                        {Array.from({ length: 3 }, (_, i) => (
                            <Skeleton
                                key={i}
                                className={cn(
                                    "h-3 rounded-full",
                                    i === 2
                                        ? "w-[min(300px,62%)]"
                                        : "w-[min(440px,92%)]",
                                )}
                            />
                        ))}
                    </div>
                    <Skeleton className="mt-1.5 h-9 w-24 rounded-[10px]" />
                </div>
            </div>
            <TrackListSkeleton count={8} />
        </div>
    )
}

function MvDetailSkeleton() {
    return (
        <div className="space-y-5" aria-busy aria-label="MV 加载中">
            <Skeleton className="aspect-video w-full rounded-[22px]" />
            <header className="flex gap-4">
                <Skeleton className="size-20 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <Skeleton className="h-3.5 w-10 rounded-full" />
                    <Skeleton className="h-6 w-[min(320px,80%)] rounded-full" />
                    <Skeleton className="h-3.5 w-[min(200px,45%)] rounded-full" />
                </div>
            </header>
        </div>
    )
}

function LocalPageSkeleton() {
    return (
        <div className="space-y-6" aria-busy aria-label="本地音乐加载中">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-28 rounded-full" />
                    <Skeleton className="h-3.5 w-40 rounded-full" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-20 rounded-full" />
                    <Skeleton className="h-8 w-24 rounded-full" />
                </div>
            </div>
            <PlaylistGridSkeleton count={5} />
        </div>
    )
}

function RadiosPageSkeleton() {
    return (
        <div className="space-y-7" aria-busy aria-label="电台列表加载中">
            <div className="flex items-end justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-24 rounded-full" />
                    <Skeleton className="h-3.5 w-36 rounded-full" />
                </div>
                <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-4 w-14 rounded-full" />
                <PlaylistGridSkeleton count={5} />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-4 w-14 rounded-full" />
                <PlaylistGridSkeleton count={5} />
            </div>
        </div>
    )
}

function SettingsPageSkeleton() {
    return (
        <div className="flex gap-10" aria-busy aria-label="设置加载中">
            <div className="w-40 shrink-0 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-full" />
                ))}
            </div>
            <div className="flex-1 space-y-6">
                <Skeleton className="h-7 w-24 rounded-full" />
                <div className="space-y-3">
                    <Skeleton className="h-5 w-3/4 rounded-full" />
                    <Skeleton className="h-5 w-full rounded-full" />
                    <Skeleton className="h-5 w-2/3 rounded-full" />
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-5 w-1/2 rounded-full" />
                    <Skeleton className="h-5 w-3/4 rounded-full" />
                    <Skeleton className="h-5 w-1/3 rounded-full" />
                </div>
            </div>
        </div>
    )
}

export {
    AlbumDetailSkeleton,
    ArtistDetailSkeleton,
    DailyColumnsSkeleton,
    DetailHeroSkeleton,
    DetailPageSkeleton,
    LocalPageSkeleton,
    LyricsSkeleton,
    MvDetailSkeleton,
    PlaylistDetailSkeleton,
    PlaylistGridSkeleton,
    RadioDetailSkeleton,
    RadioProgramDetailSkeleton,
    RadiosPageSkeleton,
    SearchResultsSkeleton,
    SettingsPageSkeleton,
    StatsPageSkeleton,
    TrackListSkeleton,
}