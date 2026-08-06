import { ChevronDown, Search } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { TrackRow } from "@/components/music/track-row"
import { StatsPageSkeleton } from "@/components/music/loading-skeletons"
import { PageTitle } from "@/components/music/page-title"
import { SortSelect } from "@/components/music/sort-select"
import {
    StatsDurationTrendChart,
    StatsPlayTrendChart,
    StatsSourceMixChart,
} from "@/components/music/stats-charts"
import { StateHero } from "@/components/music/state-hero"
import { Input } from "@/components/ui/input"
import { usePlayer } from "@/hooks/use-player"
import {
    clusterToTrack,
    getListenStats,
    listListenSourceBreakdown,
    listListenStats,
    listTopTrackClusters,
    type ListenSourceStat,
    type ListenStats,
    type TopTrackCluster,
} from "@/lib/db/play-stats"
import { formatDuration, formatListenDuration } from "@/lib/format"
import { stripExtension } from "@/lib/local/audio-formats"
import { cn } from "@/lib/utils"

type PeriodKey = "7" | "30" | "all"
type SourceFilter = "all" | "local" | "netease"
type TrackSortKey = "plays" | "duration" | "title" | "artist"
type LimitKey = "20" | "50" | "100"

const PERIODS: {
    id: PeriodKey
    label: string
    days: number | null
    chartDays: number
}[] = [
    { id: "7", label: "7 天", days: 7, chartDays: 7 },
    { id: "30", label: "30 天", days: 30, chartDays: 30 },
    { id: "all", label: "全部", days: null, chartDays: 30 },
]

const SOURCE_OPTIONS = [
    { value: "all" as const, label: "全部来源" },
    { value: "local" as const, label: "本地" },
    { value: "netease" as const, label: "网易云" },
]

const SORT_OPTIONS = [
    { value: "plays" as const, label: "最多播放" },
    { value: "duration" as const, label: "最长收听" },
    { value: "title" as const, label: "曲名" },
    { value: "artist" as const, label: "艺人" },
]

const LIMIT_OPTIONS = [
    { value: "20" as const, label: "20 首" },
    { value: "50" as const, label: "50 首" },
    { value: "100" as const, label: "100 首" },
]

const LIMIT_VALUE: Record<LimitKey, number> = {
    "20": 20,
    "50": 50,
    "100": 100,
}

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function emptyDay(day: string): ListenStats {
    return { day, playCount: 0, uniqueTracks: 0, totalMs: 0 }
}

function fillRecentDays(rows: ListenStats[], days: number): ListenStats[] {
    const map = new Map(rows.map((row) => [row.day, row]))
    const out: ListenStats[] = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(now)
        d.setUTCDate(d.getUTCDate() - i)
        const key = d.toISOString().slice(0, 10)
        out.push(map.get(key) ?? emptyDay(key))
    }
    return out
}

function sumRows(rows: ListenStats[]): { plays: number; ms: number } {
    return rows.reduce(
        (acc, row) => ({
            plays: acc.plays + row.playCount,
            ms: acc.ms + row.totalMs,
        }),
        { plays: 0, ms: 0 },
    )
}

function matchesQuery(cluster: TopTrackCluster, query: string): boolean {
    if (!query) return true
    const q = query.toLowerCase()
    return [
        cluster.title,
        cluster.artist,
        cluster.album,
        ...cluster.members.flatMap((m) => [
            m.title,
            m.artist,
            m.fileName ?? "",
            m.filePath ?? "",
        ]),
    ]
        .join(" ")
        .toLowerCase()
        .includes(q)
}

function sortClusters(
    rows: TopTrackCluster[],
    sort: TrackSortKey,
): TopTrackCluster[] {
    const next = [...rows]
    next.sort((a, b) => {
        if (sort === "plays") {
            return (
                b.playCount - a.playCount ||
                b.totalMs - a.totalMs ||
                a.title.localeCompare(b.title, "zh-CN")
            )
        }
        if (sort === "duration") {
            return (
                b.totalMs - a.totalMs ||
                b.playCount - a.playCount ||
                a.title.localeCompare(b.title, "zh-CN")
            )
        }
        if (sort === "artist") {
            return (
                (a.artist || "").localeCompare(b.artist || "", "zh-CN") ||
                b.playCount - a.playCount
            )
        }
        return a.title.localeCompare(b.title, "zh-CN") || b.playCount - a.playCount
    })
    return next
}

/** 大数字 + 单位，Screen Time 风格 */
function splitListenDuration(ms: number): { primary: string; unit: string } {
    const totalMin = Math.max(0, Math.floor(ms / 60_000))
    if (totalMin < 60) {
        return { primary: String(totalMin), unit: "分钟" }
    }
    const hours = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    if (mins === 0) {
        return { primary: String(hours), unit: hours === 1 ? "小时" : "小时" }
    }
    return { primary: String(hours), unit: `小时 ${mins} 分` }
}

function StatsPage() {
    const { playTrack, currentTrack, isPlaying } = usePlayer()
    const [period, setPeriod] = useState<PeriodKey>("7")
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
    const [trackSort, setTrackSort] = useState<TrackSortKey>("plays")
    const [limitKey, setLimitKey] = useState<LimitKey>("20")
    const [query, setQuery] = useState("")
    const [today, setToday] = useState<ListenStats | null>(null)
    const [recent, setRecent] = useState<ListenStats[]>([])
    const [periodTotals, setPeriodTotals] = useState({ plays: 0, ms: 0 })
    const [sources, setSources] = useState<ListenSourceStat[]>([])
    const [topTracks, setTopTracks] = useState<TopTrackCluster[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
    const tauri = isTauriRuntime()

    const periodMeta = PERIODS.find((p) => p.id === period) ?? PERIODS[0]!

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        void (async () => {
            if (!isTauriRuntime()) {
                if (!cancelled) {
                    setToday(null)
                    setRecent([])
                    setPeriodTotals({ plays: 0, ms: 0 })
                    setSources([])
                    setTopTracks([])
                    setLoading(false)
                }
                return
            }

            const chartDays = periodMeta.chartDays
            const topDays = periodMeta.days
            const [day, chartList, periodList, tops, mix] = await Promise.all([
                getListenStats(),
                listListenStats(chartDays),
                topDays ? listListenStats(topDays) : listListenStats(90),
                listTopTrackClusters(100, topDays),
                listListenSourceBreakdown(topDays),
            ])

            if (cancelled) return

            const filledChart = fillRecentDays(chartList, chartDays)
            setToday(day)
            setRecent(filledChart)
            if (topDays) {
                setPeriodTotals(sumRows(fillRecentDays(periodList, topDays)))
            } else {
                setPeriodTotals({
                    plays: mix.reduce((s, r) => s + r.playCount, 0),
                    ms: mix.reduce((s, r) => s + r.totalMs, 0),
                })
            }
            setTopTracks(tops)
            setSources(mix)
            setLoading(false)
        })()
        return () => {
            cancelled = true
        }
    }, [periodMeta.chartDays, periodMeta.days, period])

    const heroLabel = useMemo(() => {
        if (period === "7") return "过去 7 天"
        if (period === "30") return "过去 30 天"
        return "全部时间"
    }, [period])

    const dailyAvgMs = useMemo(() => {
        const days = periodMeta.days ?? Math.max(recent.length, 1)
        return Math.round(periodTotals.ms / Math.max(1, days))
    }, [periodMeta.days, periodTotals.ms, recent.length])

    const heroParts = useMemo(
        () => splitListenDuration(periodTotals.ms),
        [periodTotals.ms],
    )

    const filteredTracks = useMemo(() => {
        let rows = topTracks
        if (sourceFilter !== "all") {
            rows = rows.filter((item) => item.source === sourceFilter)
        }
        const q = query.trim()
        if (q) rows = rows.filter((item) => matchesQuery(item, q))
        return sortClusters(rows, trackSort).slice(0, LIMIT_VALUE[limitKey])
    }, [topTracks, sourceFilter, query, trackSort, limitKey])

    function toggleExpand(key: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    function onPlayCluster(cluster: TopTrackCluster) {
        playTrack(clusterToTrack(cluster), filteredTracks.map(clusterToTrack))
    }

    return (
        <div className="space-y-11 pb-10">
            <PageTitle
                title="统计"
                subtitle="了解你的听歌习惯"
                trailing={
                    tauri ? (
                        <Segmented
                            items={PERIODS.map((p) => ({
                                id: p.id,
                                label: p.label,
                            }))}
                            value={period}
                            onChange={setPeriod}
                        />
                    ) : null
                }
            />

            {!tauri ? (
                <StateHero
                    variant="empty"
                    title="仅桌面端可用"
                    description="听歌统计保存在本机，请打开 MusicStorm 桌面应用"
                />
            ) : loading ? (
                <StatsPageSkeleton />
            ) : (
                <>
                    {/* 主指标：无卡片包裹，数字即界面 */}
                    <section className="px-0.5">
                        <p className="text-[13px] font-medium text-muted-foreground">
                            {heroLabel}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-0">
                            <span
                                className={cn(
                                    "font-semibold leading-[0.95] tracking-[-0.055em] tabular-nums text-foreground",
                                    "text-[64px] sm:text-[72px]",
                                )}
                            >
                                {heroParts.primary}
                            </span>
                            <span className="mb-2 text-[28px] font-semibold tracking-[-0.035em] text-foreground/80 sm:mb-2.5 sm:text-[32px]">
                                {heroParts.unit}
                            </span>
                        </div>
                        <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                            <span className="font-medium tabular-nums text-foreground">
                                {periodTotals.plays.toLocaleString("zh-CN")}
                            </span>{" "}
                            次播放
                            {periodTotals.ms > 0 ? (
                                <>
                                    <span className="mx-2 opacity-30">·</span>
                                    日均{" "}
                                    <span className="font-medium tabular-nums text-foreground">
                                        {formatListenDuration(dailyAvgMs)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">
                                    {" "}
                                    · 多听几首后会在这里汇总
                                </span>
                            )}
                        </p>
                    </section>

                    {/* 今日：三等分，竖线分隔 — Fitness 风格 */}
                    <section className="space-y-3">
                        <SectionLabel>今日</SectionLabel>
                        <div className="material-panel grid grid-cols-3 overflow-hidden rounded-[22px]">
                            <MetricCell
                                label="播放"
                                value={String(today?.playCount ?? 0)}
                            />
                            <MetricCell
                                label="曲目"
                                value={String(today?.uniqueTracks ?? 0)}
                                bordered
                            />
                            <MetricCell
                                label="时长"
                                value={formatListenDuration(
                                    today?.totalMs ?? 0,
                                )}
                                bordered
                                compactValue
                            />
                        </div>
                    </section>

                    {/* 活动 */}
                    <section className="space-y-3">
                        <div className="flex items-end justify-between gap-3 px-0.5">
                            <SectionLabel large>活动</SectionLabel>
                            <p className="pb-0.5 text-[13px] text-muted-foreground">
                                {period === "all"
                                    ? "近 30 天"
                                    : `近 ${periodMeta.chartDays} 天`}
                            </p>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                            <StatsPlayTrendChart rows={recent} />
                            <StatsDurationTrendChart rows={recent} />
                        </div>
                    </section>

                    {/* 来源 */}
                    <section className="space-y-3">
                        <SectionLabel large>来源</SectionLabel>
                        <StatsSourceMixChart rows={sources} />
                    </section>

                    {/* 常听 */}
                    <section className="space-y-3.5">
                        <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
                            <SectionLabel large>常听</SectionLabel>
                            {filteredTracks.length > 0 ? (
                                <p className="pb-0.5 text-[13px] text-muted-foreground">
                                    {filteredTracks.length} 首
                                </p>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                            <div className="relative min-w-0 flex-1">
                                <Search
                                    className="pointer-events-none absolute top-1/2 left-3.5 size-[15px] -translate-y-1/2 text-muted-foreground/65"
                                    strokeWidth={2}
                                />
                                <Input
                                    value={query}
                                    onChange={(e) =>
                                        setQuery(e.currentTarget.value)
                                    }
                                    placeholder="搜索歌曲或艺人"
                                    className={cn(
                                        "h-10 rounded-full border-0 bg-black/[0.05] pl-10 text-[14px]",
                                        "shadow-none placeholder:text-muted-foreground/55",
                                        "focus-visible:bg-black/[0.06] focus-visible:ring-1 focus-visible:ring-black/8",
                                        "dark:bg-white/[0.08] dark:focus-visible:bg-white/[0.1] dark:focus-visible:ring-white/12",
                                    )}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <SortSelect
                                    value={sourceFilter}
                                    options={SOURCE_OPTIONS}
                                    onChange={setSourceFilter}
                                    label="来源"
                                />
                                <SortSelect
                                    value={trackSort}
                                    options={SORT_OPTIONS}
                                    onChange={setTrackSort}
                                    label="排序"
                                />
                                <SortSelect
                                    value={limitKey}
                                    options={LIMIT_OPTIONS}
                                    onChange={setLimitKey}
                                    label="数量"
                                />
                            </div>
                        </div>

                        {filteredTracks.length === 0 ? (
                            <StateHero
                                variant="empty"
                                className="min-h-[168px] rounded-[22px]"
                                title={
                                    topTracks.length === 0
                                        ? "还没有常听歌曲"
                                        : "没有匹配结果"
                                }
                                description={
                                    topTracks.length === 0
                                        ? "播放几首歌后，排行会出现在这里"
                                        : "换个关键词或来源再试"
                                }
                            />
                        ) : (
                            <div className="apple-list-surface space-y-0.5 p-1.5">
                                {filteredTracks.map((cluster, index) => {
                                    const open = expanded.has(cluster.key)
                                    const canExpand = cluster.memberCount > 1
                                    const rep = clusterToTrack(cluster)
                                    const rank = (
                                        <span
                                            className={cn(
                                                "w-5 shrink-0 text-center text-[13px] tabular-nums",
                                                index < 3
                                                    ? "font-semibold text-foreground"
                                                    : "font-medium text-muted-foreground",
                                            )}
                                        >
                                            {index + 1}
                                        </span>
                                    )
                                    const chevron = canExpand ? (
                                        <button
                                            type="button"
                                            aria-expanded={open}
                                            aria-label={
                                                open ? "收起" : "展开重复文件"
                                            }
                                            onClick={() =>
                                                toggleExpand(cluster.key)
                                            }
                                            className={cn(
                                                "mr-1 flex size-7 items-center justify-center",
                                                "text-muted-foreground/70 hover:text-foreground active:scale-[0.96]",
                                            )}
                                        >
                                            <ChevronDown
                                                className={cn(
                                                    "size-4 transition-transform duration-200 ease-out",
                                                    !open && "-rotate-90",
                                                )}
                                            />
                                        </button>
                                    ) : null
                                    const leading = (
                                        <div className="flex w-[42px] shrink-0 items-center">
                                            {chevron}
                                            {rank}
                                        </div>
                                    )
                                    return (
                                        <div key={cluster.key}>
                                            <TrackRow
                                                track={rep}
                                                leading={leading}
                                                isActive={
                                                    currentTrack?.id === rep.id
                                                }
                                                isPlaying={
                                                    currentTrack?.id === rep.id &&
                                                    isPlaying
                                                }
                                                showSource
                                                showAlbumMeta={false}
                                                showActions={false}
                                                onPlay={() =>
                                                    onPlayCluster(cluster)
                                                }
                                                trailing={
                                                    <span>
                                                        {cluster.playCount}
                                                        <span className="ml-0.5 font-normal text-muted-foreground/70">
                                                            次
                                                        </span>
                                                    </span>
                                                }
                                            />
                                            {open && canExpand ? (
                                                <div className="border-t border-black/[0.04] bg-black/[0.02] dark:border-white/[0.05] dark:bg-white/[0.02] ml-3 rounded-b-xl">
                                                    {cluster.members.map(
                                                        (member) => (
                                                            <div
                                                                key={
                                                                    member.trackId
                                                                }
                                                                className="flex gap-3 py-2 pr-4 pl-16"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="truncate text-[13px] font-medium text-foreground/90">
                                                                        {stripExtension(
                                                                            member.fileName ||
                                                                                member.title,
                                                                        )}
                                                                    </p>
                                                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/75">
                                                                        {member.filePath ||
                                                                            member.trackId}
                                                                    </p>
                                                                </div>
                                                                <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                                                    <p>
                                                                        {
                                                                            member.playCount
                                                                        }{" "}
                                                                        次
                                                                    </p>
                                                                    <p>
                                                                        {formatDuration(
                                                                            member.totalMs,
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    )
}

function SectionLabel({
    children,
    large = false,
}: {
    children: ReactNode
    large?: boolean
}) {
    return (
        <h2
            className={cn(
                "px-0.5 font-semibold tracking-[-0.03em] text-foreground",
                large ? "text-[22px]" : "text-[13px] text-muted-foreground",
            )}
        >
            {children}
        </h2>
    )
}

function MetricCell({
    label,
    value,
    bordered = false,
    compactValue = false,
}: {
    label: string
    value: string
    bordered?: boolean
    compactValue?: boolean
}) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-5 text-center",
                bordered &&
                    "border-l border-black/[0.06] dark:border-white/[0.08]",
            )}
        >
            <p className="text-[12px] font-medium text-muted-foreground">
                {label}
            </p>
            <p
                className={cn(
                    "font-semibold tracking-[-0.03em] tabular-nums text-foreground",
                    compactValue
                        ? "text-[17px] sm:text-[19px]"
                        : "text-[22px] sm:text-[24px]",
                )}
            >
                {value}
            </p>
        </div>
    )
}

function Segmented<T extends string>({
    items,
    value,
    onChange,
}: {
    items: { id: T; label: string }[]
    value: T
    onChange: (next: T) => void
}) {
    return (
        <div
            role="tablist"
            aria-label="统计时段"
            className="inline-flex rounded-full bg-black/[0.06] p-[3px] dark:bg-white/[0.1]"
        >
            {items.map((item) => {
                const active = value === item.id
                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(item.id)}
                        className={cn(
                            "min-w-[3.25rem] rounded-full px-3.5 py-[6px] text-[13px] font-medium tracking-[-0.01em]",
                            "transition-[color,background-color,box-shadow,transform] duration-150",
                            "active:scale-[0.97]",
                            active
                                ? cn(
                                      "bg-background text-foreground",
                                      "shadow-[0_1px_3px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]",
                                      "dark:bg-[#2c2c2e] dark:shadow-none",
                                  )
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {item.label}
                    </button>
                )
            })}
        </div>
    )
}

export { StatsPage }