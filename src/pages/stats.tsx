import { AudioLines, CalendarDays, ChevronDown, Search } from "lucide-react"
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
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
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

type PeriodKey = "7" | "30" | "all" | "custom"
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

// 后端统计窗口上限，全部时段的日均与活跃天数按此口径
const ALL_PERIOD_WINDOW_DAYS = 90

function dateStr(offsetDays: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - offsetDays)
    return d.toISOString().slice(0, 10)
}

// 本地时区转 YYYY-MM-DD，日历选择与用户所见一致
function ymd(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function parseYmd(s: string): Date | undefined {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return undefined
    }
    const d = new Date(`${s}T00:00:00`)
    return Number.isNaN(d.getTime()) ? undefined : d
}

function rangeDays(from: string, to: string): number {
    const diff =
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000
    return Math.max(1, Math.min(90, Math.round(diff) + 1))
}

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

// 大数字 + 单位，主导指标
function splitListenDuration(ms: number): { primary: string; unit: string } {
    const totalMin = Math.max(0, Math.floor(ms / 60_000))
    if (totalMin < 60) {
        return { primary: String(totalMin), unit: "分钟" }
    }
    const hours = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    if (mins === 0) {
        return { primary: String(hours), unit: "小时" }
    }
    return { primary: String(hours), unit: `小时 ${mins} 分` }
}

function StatsPage() {
    const { playTrack, currentTrack, isPlaying } = usePlayer()
    const [period, setPeriod] = useState<PeriodKey>("7")
    const [fromDate, setFromDate] = useState(() => dateStr(29))
    const [toDate, setToDate] = useState(() => dateStr(0))
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
    const [trackSort, setTrackSort] = useState<TrackSortKey>("plays")
    const [limitKey, setLimitKey] = useState<LimitKey>("20")
    const [query, setQuery] = useState("")
    // 自定义时段被点击时立即拉起日期选择的控制
    const [dateOpen, setDateOpen] = useState(false)
    const [today, setToday] = useState<ListenStats | null>(null)
    const [recent, setRecent] = useState<ListenStats[]>([])
    const [periodRows, setPeriodRows] = useState<ListenStats[]>([])
    const [periodTotals, setPeriodTotals] = useState({ plays: 0, ms: 0 })
    const [sources, setSources] = useState<ListenSourceStat[]>([])
    const [topTracks, setTopTracks] = useState<TopTrackCluster[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
    const tauri = isTauriRuntime()

    const periodMeta = PERIODS.find((p) => p.id === period) ?? PERIODS[0]!

    const isCustom = period === "custom"
    const from = isCustom ? fromDate : undefined
    const to = isCustom ? toDate : undefined
    const chartDays = isCustom
        ? rangeDays(fromDate, toDate)
        : periodMeta.chartDays
    const topDays = isCustom ? null : periodMeta.days
    // 日均与活跃口径的天数：自定义按实际跨度，全部时段按后端窗口
    const periodDays = isCustom
        ? chartDays
        : (periodMeta.days ?? ALL_PERIOD_WINDOW_DAYS)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        void (async () => {
            if (!isTauriRuntime()) {
                if (!cancelled) {
                    setToday(null)
                    setRecent([])
                    setPeriodRows([])
                    setPeriodTotals({ plays: 0, ms: 0 })
                    setSources([])
                    setTopTracks([])
                    setLoading(false)
                }
                return
            }

            const [day, chartList, periodList, tops, mix] = await Promise.all([
                getListenStats(),
                listListenStats(chartDays, from, to),
                isCustom
                    ? listListenStats(90, from, to)
                    : topDays
                      ? listListenStats(topDays)
                      : listListenStats(90),
                listTopTrackClusters(100, topDays, from, to),
                listListenSourceBreakdown(topDays, from, to),
            ])

            if (cancelled) return

            setToday(day)
            setRecent(fillRecentDays(chartList, chartDays))
            setPeriodRows(periodList)
            setPeriodTotals(sumRows(periodList))
            setTopTracks(tops)
            setSources(mix)
            setLoading(false)
        })()
        return () => {
            cancelled = true
        }
    }, [chartDays, topDays, from, to])

    const heroLabel = useMemo(() => {
        if (period === "custom") return `${fromDate} 至 ${toDate}`
        if (period === "7") return "过去 7 天"
        if (period === "30") return "过去 30 天"
        return "全部时间"
    }, [period, fromDate, toDate])

    const dailyAvgMs = useMemo(
        () => Math.round(periodTotals.ms / Math.max(1, periodDays)),
        [periodTotals.ms, periodDays],
    )

    const avgPlays = useMemo(
        () => Math.round(periodTotals.plays / Math.max(1, periodDays)),
        [periodTotals.plays, periodDays],
    )

    const heroParts = useMemo(
        () => splitListenDuration(periodTotals.ms),
        [periodTotals.ms],
    )

    const activeDays = useMemo(
        () => periodRows.filter((row) => row.playCount > 0).length,
        [periodRows],
    )

    const heroCells = useMemo(() => {
        const hasData = periodTotals.plays > 0 || periodTotals.ms > 0
        return [
            {
                label: "播放次数",
                value: hasData
                    ? `${periodTotals.plays.toLocaleString("zh-CN")} 次`
                    : "—",
            },
            {
                label: "日均时长",
                value: periodTotals.ms > 0 ? formatListenDuration(dailyAvgMs) : "—",
            },
            {
                label: "听过曲目",
                value:
                    topTracks.length > 0
                        ? `${topTracks.length}${topTracks.length >= 100 ? "+" : ""} 首`
                        : "—",
            },
            {
                label: "活跃天数",
                value: periodRows.length > 0 ? `${activeDays} 天` : "—",
            },
        ]
    }, [
        periodTotals,
        dailyAvgMs,
        topTracks.length,
        periodRows.length,
        activeDays,
    ])

    const chartPlays = useMemo(
        () => recent.reduce((sum, row) => sum + row.playCount, 0),
        [recent],
    )

    const chartMs = useMemo(
        () => recent.reduce((sum, row) => sum + row.totalMs, 0),
        [recent],
    )

    const sourceTotal = useMemo(
        () => sources.reduce((sum, item) => sum + item.playCount, 0),
        [sources],
    )

    const todayLabel = useMemo(() => {
        const d = new Date()
        return `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六".charAt(d.getDay())}`
    }, [])

    const todayDiff = (today?.playCount ?? 0) - avgPlays

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

    // 全部时段的图表只画近 30 天，图注里显式说明口径
    const chartCaption = period === "all" ? "近 30 天" : undefined

    return (
        <div className="space-y-8 pb-6">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <PageTitle
                    title="统计"
                    subtitle="看看这段时间，你都把时间花在了哪首歌上"
                />
                {tauri ? (
                    <div className="flex items-center gap-2">
                        <Segmented
                            items={PERIODS.map((p) => ({
                                id: p.id,
                                label: p.label,
                            }))}
                            value={period}
                            onChange={setPeriod}
                        />
                        {/* 日历按钮常驻：打开即进入自定义时段，与分段控件平级 */}
                        <Popover
                            open={dateOpen}
                            onOpenChange={(next) => {
                                if (next && period !== "custom") {
                                    setPeriod("custom")
                                }
                                setDateOpen(next)
                            }}
                        >
                            <PopoverTrigger
                                render={(props) => (
                                    <button
                                        {...props}
                                        type="button"
                                        title="选择日期范围"
                                        aria-label="选择日期范围"
                                        className={cn(
                                            "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full",
                                            "transition-[background-color,color,box-shadow,transform]",
                                            "active:scale-[0.97] active:duration-[var(--duration-press)]",
                                            period === "custom"
                                                ? cn(
                                                      "bg-background text-foreground",
                                                      "shadow-[0_1px_3px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]",
                                                      "dark:bg-[#2c2c2e] dark:shadow-none",
                                                  )
                                                : "bg-[var(--surface-fill)] text-foreground/70 hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                                        )}
                                    >
                                        <CalendarDays className="size-4" />
                                    </button>
                                )}
                            />
                            <PopoverContent
                                align="end"
                                sideOffset={8}
                                className="w-fit p-2"
                            >
                                <Calendar
                                    mode="range"
                                    numberOfMonths={2}
                                    selected={{
                                        from: parseYmd(fromDate),
                                        to: parseYmd(toDate),
                                    }}
                                    onSelect={(range) => {
                                        if (range?.from) {
                                            const from = ymd(range.from)
                                            const to = range.to
                                                ? ymd(range.to)
                                                : from
                                            if (from <= to) {
                                                setFromDate(from)
                                                setToDate(to)
                                            } else {
                                                setFromDate(to)
                                                setToDate(from)
                                            }
                                        }
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                ) : null}
            </div>

            {!tauri ? (
                <StateHero
                    variant="empty"
                    className="rounded-[22px]"
                    title="统计存在你的本机"
                    description="打开 MusicStorm 桌面应用，就能看到这段时间的听歌习惯"
                />
            ) : loading ? (
                <StatsPageSkeleton />
            ) : (
                <>
                    {/* 收听总览：大数字主导，底部数据带用发丝线分隔 */}
                    <section className="material-surface relative overflow-hidden rounded-[22px]">
                        <div aria-hidden className="stats-hero-glow" />
                        <div className="relative p-6 sm:p-8">
                            <div className="flex items-center gap-2.5">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <AudioLines
                                        className="size-[15px]"
                                        strokeWidth={2}
                                    />
                                </span>
                                <p className="text-[13px] font-semibold tracking-[0.01em] text-primary">
                                    {heroLabel}
                                </p>
                            </div>
                            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className="text-[56px] font-bold leading-[0.95] tracking-[-0.05em] tabular-nums text-foreground sm:text-[76px]">
                                    {heroParts.primary}
                                </span>
                                <span className="text-[24px] font-semibold tracking-[-0.03em] text-foreground/75 sm:text-[30px]">
                                    {heroParts.unit}
                                </span>
                            </div>
                        </div>
                        <div className="relative grid grid-cols-2 border-t border-[var(--separator)] sm:grid-cols-4">
                            {heroCells.map((cell, index) => (
                                <div
                                    key={cell.label}
                                    className={cn(
                                        "px-6 py-4 sm:px-8 sm:py-5",
                                        index === 1 &&
                                            "border-l border-[var(--separator)]",
                                        index === 2 &&
                                            "border-t border-[var(--separator)] sm:border-t-0 sm:border-l",
                                        index === 3 &&
                                            "border-l border-t border-[var(--separator)] sm:border-t-0",
                                    )}
                                >
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        {cell.label}
                                    </p>
                                    <p className="mt-1.5 text-[17px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
                                        {cell.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 概览 bento：宽图表配窄面板，7 比 5 的不对称栅格 */}
                    <section className="grid gap-4 lg:grid-cols-12">
                        <PanelCard
                            title="播放趋势"
                            caption={
                                chartCaption ??
                                (chartPlays > 0 ? `${chartPlays} 次` : undefined)
                            }
                            className="lg:col-span-7"
                        >
                            <StatsPlayTrendChart rows={recent} />
                        </PanelCard>

                        <PanelCard
                            title="今日"
                            caption={todayLabel}
                            className="lg:col-span-5"
                        >
                            <div className="flex h-full flex-col justify-center">
                                <div>
                                    {[
                                        {
                                            label: "播放",
                                            value: `${today?.playCount ?? 0} 次`,
                                        },
                                        {
                                            label: "曲目",
                                            value: `${today?.uniqueTracks ?? 0} 首`,
                                        },
                                        {
                                            label: "时长",
                                            value: formatListenDuration(
                                                today?.totalMs ?? 0,
                                            ),
                                        },
                                        {
                                            label: "较日均",
                                            value:
                                                todayDiff === 0
                                                    ? "持平"
                                                    : `${todayDiff > 0 ? "+" : ""}${todayDiff} 次`,
                                        },
                                    ].map((row) => (
                                        <SummaryRow
                                            key={row.label}
                                            label={row.label}
                                            value={row.value}
                                        />
                                    ))}
                                </div>
                            </div>
                        </PanelCard>

                        <PanelCard
                            title="收听趋势"
                            caption={
                                chartCaption ??
                                (chartMs > 0
                                    ? formatListenDuration(chartMs)
                                    : undefined)
                            }
                            className="lg:col-span-7"
                        >
                            <StatsDurationTrendChart rows={recent} />
                        </PanelCard>

                        <PanelCard
                            title="来源构成"
                            caption={
                                sourceTotal > 0
                                    ? `${sourceTotal} 次`
                                    : undefined
                            }
                            className="lg:col-span-5"
                        >
                            <StatsSourceMixChart rows={sources} />
                        </PanelCard>
                    </section>

                    {/* 常听：独立分栏，保持高密度列表 */}
                    <section>
                        <div className="mb-5 flex flex-wrap items-end justify-between gap-2 px-0.5">
                            <h2 className="text-[22px] font-bold tracking-[-0.03em] text-foreground">
                                常听
                            </h2>
                            {filteredTracks.length > 0 ? (
                                <span className="text-[13px] tabular-nums text-muted-foreground">
                                    {filteredTracks.length} 首
                                </span>
                            ) : null}
                        </div>

                        <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
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
                                    aria-label="搜索常听歌曲"
                                    placeholder="搜一下哪首歌最常陪着你"
                                    className={cn(
                                        "material-field h-10 rounded-full border-0 pl-10 text-[14px]",
                                        "shadow-none placeholder:text-muted-foreground/55",
                                        "focus-visible:ring-1 focus-visible:ring-ring/30",
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
                                className="min-h-[172px] rounded-[22px]"
                                title={
                                    topTracks.length === 0
                                        ? "还没有常听的歌"
                                        : "没有匹配的结果"
                                }
                                description={
                                    topTracks.length === 0
                                        ? "播放过几首后，排行会自然地冒出来"
                                        : "换个关键词或来源再翻翻"
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
                                                "w-6 shrink-0 text-center text-[13px] tabular-nums",
                                                index < 3
                                                    ? "font-semibold text-primary"
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
                                                    "size-4 transition-transform duration-[var(--duration-hover)]",
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
                                                showAddToPlaylist
                                                onPlay={() =>
                                                    onPlayCluster(cluster)
                                                }
                                                trailing={
                                                    <span className="tabular-nums">
                                                        {cluster.playCount}
                                                        <span className="ml-0.5 font-normal text-muted-foreground/70">
                                                            次
                                                        </span>
                                                    </span>
                                                }
                                            />
                                            {open && canExpand ? (
                                                <div className="ml-3 rounded-b-xl border-t border-[var(--separator)] bg-[var(--surface-fill)]">
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

// 概览卡片外壳：标题与图注内嵌，内容区撑满剩余高度
function PanelCard({
    title,
    caption,
    className,
    children,
}: {
    title: string
    caption?: string
    className?: string
    children: ReactNode
}) {
    return (
        <section
            className={cn(
                "material-panel flex flex-col rounded-[22px] p-5",
                className,
            )}
        >
            <div className="mb-4 flex items-baseline justify-between gap-3 px-0.5">
                <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                    {title}
                </h2>
                {caption ? (
                    <p className="truncate text-[12px] font-medium tabular-nums text-muted-foreground">
                        {caption}
                    </p>
                ) : null}
            </div>
            <div className="min-h-0 flex-1">{children}</div>
        </section>
    )
}

// 今日摘要行：标签与数值两端对齐，行间发丝线分隔
function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 border-t border-[var(--separator)] py-3 first:border-t-0">
            <p className="text-[13px] text-muted-foreground">{label}</p>
            <p className="text-[15px] font-semibold tracking-[-0.01em] tabular-nums text-foreground">
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
            className="material-segmented inline-flex shrink-0 rounded-full p-[3px]"
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
                            "transition-[color,background-color,box-shadow,transform]",
                            "active:scale-[0.97] active:duration-[var(--duration-press)]",
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
