import type { CSSProperties, Ref } from "react"

import { Skeleton } from "@/components/ui/skeleton"
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
                    className="flex flex-col gap-3 rounded-[22px] bg-black/[0.03] p-3 dark:bg-white/[0.04]"
                >
                    <Skeleton className="aspect-square w-full rounded-2xl" />
                    <div className="space-y-2 px-0.5">
                        <Skeleton className="h-3.5 w-[78%] rounded-full" />
                        <Skeleton className="h-3 w-[42%] rounded-full" />
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
                        "grid items-center gap-3 rounded-2xl px-3 py-2",
                        indexed
                            ? "grid-cols-[auto_auto_minmax(0,1fr)_auto]"
                            : "grid-cols-[auto_minmax(0,1fr)_auto]",
                    )}
                >
                    {indexed ? (
                        <Skeleton className="h-3 w-5 rounded-full" />
                    ) : null}
                    <Skeleton className="size-11 shrink-0 rounded-xl" />
                    <div className="min-w-0 space-y-2">
                        <Skeleton
                            className={cn(
                                "h-3.5 rounded-full",
                                index % 3 === 0
                                    ? "w-[72%]"
                                    : index % 3 === 1
                                      ? "w-[58%]"
                                      : "w-[66%]",
                            )}
                        />
                        <Skeleton
                            className={cn(
                                "h-3 rounded-full",
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

/** 详情页顶栏：封面 + 文案骨架 */
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

/** 歌手 / 专辑 / 歌单详情整页骨架 */
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

/** 首页每日推荐三栏骨架 */
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
                    className="rounded-[22px] border border-black/[0.05] bg-black/[0.02] p-2 dark:border-white/[0.06] dark:bg-white/[0.03]"
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

/** 统计页骨架 */
function StatsPageSkeleton() {
    return (
        <div className="space-y-11" aria-busy aria-label="加载中">
            <div className="space-y-2 px-0.5">
                <Skeleton className="h-3.5 w-16 rounded-full" />
                <div className="flex items-end gap-2">
                    <Skeleton className="h-16 w-28 rounded-[18px] sm:h-[72px]" />
                    <Skeleton className="mb-2 h-8 w-20 rounded-full" />
                </div>
                <Skeleton className="mt-1 h-4 w-56 rounded-full" />
            </div>

            <div className="space-y-3">
                <Skeleton className="h-3.5 w-10 rounded-full" />
                <div className="material-panel grid grid-cols-3 overflow-hidden rounded-[22px]">
                    {Array.from({ length: 3 }, (_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex flex-col items-center gap-2 px-2 py-5",
                                i > 0 &&
                                    "border-l border-black/[0.06] dark:border-white/[0.08]",
                            )}
                        >
                            <Skeleton className="h-3 w-8 rounded-full" />
                            <Skeleton className="h-6 w-12 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <Skeleton className="h-6 w-12 rounded-full" />
                <div className="grid gap-3 lg:grid-cols-2">
                    <Skeleton className="h-[210px] w-full rounded-[22px]" />
                    <Skeleton className="h-[210px] w-full rounded-[22px]" />
                </div>
            </div>

            <div className="space-y-3">
                <Skeleton className="h-6 w-12 rounded-full" />
                <Skeleton className="h-[168px] w-full rounded-[22px]" />
            </div>

            <div className="space-y-3.5">
                <Skeleton className="h-6 w-12 rounded-full" />
                <Skeleton className="h-10 w-full rounded-full" />
                <TrackListSkeleton count={6} />
            </div>
        </div>
    )
}

/** 歌单详情骨架：标签条 + 大标题 + 描述 + 播放按钮 + 带序号曲目 */
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

/** 专辑详情骨架：封面 + 专辑标签 + 标题 + 歌手年份 + 播放按钮 + 曲目 */
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

/** 歌手详情骨架：圆形头像 + 名字 + 统计 + Tab 条 + 热门曲目 + 专辑网格 */
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

/** 电台详情骨架：封面 + 电台标签 + 标题 + DJ 信息 + 简介 + 按钮 + 曲目 */
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

/** 电台节目骨架：大封面 + 节目标签 + 标题 + 电台/时长 + 多行简介 + 播放按钮 + 曲目 */
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

/** MV 详情骨架：16:9 视频块 + 小封面 + 标签 + 标题 + 歌手 */
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

/** 本地音乐骨架：标题 + 工具栏 + 专辑网格 */
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

/** 电台列表骨架：订阅 + 发现两段网格 */
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

/** 设置页骨架：左侧 tab 列表 + 右侧内容区 */
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