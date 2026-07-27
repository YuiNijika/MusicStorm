import { ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Cover } from "@/components/music/cover"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import {
    StatsDurationTrendChart,
    StatsPlayTrendChart,
    StatsSourceMixChart,
} from "@/components/music/stats-charts"
import { StateHero } from "@/components/music/state-hero"
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

const PERIODS: { id: PeriodKey; label: string; days: number | null; chartDays: number }[] = [
    { id: "7", label: "7 日", days: 7, chartDays: 7 },
    { id: "30", label: "30 日", days: 30, chartDays: 30 },
    { id: "all", label: "全部", days: null, chartDays: 30 },
]

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function emptyDay(day: string): ListenStats {
    return { day, playCount: 0, uniqueTracks: 0, totalMs: 0 }
}

/** 补全近 N 日空档，图表横轴连续 */
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

function StatsPage() {
    const { playTrack } = usePlayer()
    const [period, setPeriod] = useState<PeriodKey>("7")
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
                listTopTrackClusters(20, topDays),
                listListenSourceBreakdown(topDays),
            ])

            if (cancelled) {
                return
            }

            const filledChart = fillRecentDays(chartList, chartDays)
            const filledPeriod = topDays
                ? fillRecentDays(periodList, topDays)
                : fillRecentDays(periodList, Math.min(90, periodList.length || 30))

            setToday(day)
            setRecent(filledChart)
            if (topDays) {
                setPeriodTotals(sumRows(filledPeriod))
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

    const heroSubtitle = useMemo(() => {
        if (period === "7") return "近 7 日收听"
        if (period === "30") return "近 30 日收听"
        return "全部收听"
    }, [period])

    function toggleExpand(key: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    function onPlayCluster(cluster: TopTrackCluster) {
        const track = clusterToTrack(cluster)
        playTrack(track, [track])
    }

    return (
        <div className="space-y-6 pb-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <PageTitle title="统计" subtitle="听歌时长与最常听的歌曲" />
                {tauri ? (
                    <div className="glass-chip inline-flex rounded-full p-0.5">
                        {PERIODS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setPeriod(item.id)}
                                className={cn(
                                    "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                                    period === item.id
                                        ? "bg-background/90 text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            {!tauri ? (
                <StateHero
                    variant="empty"
                    title="仅桌面端可用"
                    description="听歌统计写入本机数据库，请在 MusicStorm 桌面应用中查看"
                />
            ) : loading ? (
                <div className="space-y-3">
                    <div className="material-panel h-36 animate-pulse rounded-[24px]" />
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="material-panel h-20 animate-pulse rounded-[20px]" />
                        <div className="material-panel h-20 animate-pulse rounded-[20px]" />
                        <div className="material-panel h-20 animate-pulse rounded-[20px]" />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="material-panel h-48 animate-pulse rounded-[22px]" />
                        <div className="material-panel h-48 animate-pulse rounded-[22px]" />
                    </div>
                </div>
            ) : (
                <>
                    <div className="material-panel rounded-[24px] px-5 py-5 sm:px-6 sm:py-6">
                        <p className="text-[13px] text-muted-foreground">{heroSubtitle}</p>
                        <p className="mt-1 text-[36px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[42px]">
                            {formatListenDuration(periodTotals.ms)}
                        </p>
                        <p className="mt-2 text-[13px] text-muted-foreground">
                            <span className="tabular-nums text-foreground/90">
                                {periodTotals.plays}
                            </span>{" "}
                            次有效播放
                            {periodTotals.ms > 0 ? (
                                <>
                                    <span className="mx-1.5 opacity-40">·</span>
                                    日均{" "}
                                    <span className="tabular-nums text-foreground/90">
                                        {formatListenDuration(
                                            Math.round(
                                                periodTotals.ms /
                                                    Math.max(
                                                        1,
                                                        periodMeta.days ??
                                                            Math.max(recent.length, 1),
                                                    ),
                                            ),
                                        )}
                                    </span>
                                </>
                            ) : null}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatCard
                            label="今日播放"
                            value={String(today?.playCount ?? 0)}
                            hint="有效听歌次数"
                        />
                        <StatCard
                            label="今日曲目"
                            value={String(today?.uniqueTracks ?? 0)}
                            hint="按曲目去重"
                        />
                        <StatCard
                            label="今日时长"
                            value={formatListenDuration(today?.totalMs ?? 0)}
                            hint="累计收听"
                        />
                    </div>

                    <Section
                        title="趋势"
                        description={
                            period === "all"
                                ? "图表展示近 30 日，汇总为全部时段"
                                : `近 ${periodMeta.chartDays} 日`
                        }
                    >
                        <div className="grid gap-3 lg:grid-cols-2">
                            <StatsPlayTrendChart rows={recent} />
                            <StatsDurationTrendChart rows={recent} />
                        </div>
                    </Section>

                    <Section title="来源" description="本地与网易云听歌占比">
                        <StatsSourceMixChart rows={sources} />
                    </Section>

                    <Section
                        title="听得最多"
                        description="本地同内容或同名合并，点按即可播放"
                    >
                        {topTracks.length === 0 ? (
                            <StateHero
                                variant="empty"
                                title="暂无排行"
                                description="多听几首后会出现在这里"
                            />
                        ) : (
                            <div className="space-y-1 overflow-hidden rounded-[22px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
                                {topTracks.map((cluster, index) => {
                                    const open = expanded.has(cluster.key)
                                    const canExpand = cluster.memberCount > 1
                                    return (
                                        <div key={cluster.key} className="min-w-0">
                                            <div
                                                className={cn(
                                                    "flex w-full min-w-0 items-center gap-2 rounded-[16px] px-1.5 py-1.5",
                                                    "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                                                )}
                                            >
                                                {canExpand ? (
                                                    <button
                                                        type="button"
                                                        aria-label={open ? "收起" : "展开"}
                                                        onClick={() => toggleExpand(cluster.key)}
                                                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                                                    >
                                                        {open ? (
                                                            <ChevronDown className="size-4 opacity-70" />
                                                        ) : (
                                                            <ChevronRight className="size-4 opacity-70" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="size-7 shrink-0" />
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => onPlayCluster(cluster)}
                                                    className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] px-1 py-1 text-left active:scale-[0.99]"
                                                >
                                                    <span className="w-5 shrink-0 text-center text-[12px] tabular-nums text-muted-foreground">
                                                        {index + 1}
                                                    </span>
                                                    <Cover
                                                        src={cluster.coverUrl ?? ""}
                                                        alt=""
                                                        size="sm"
                                                        className="size-11 shrink-0 rounded-[12px]"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[14px] font-medium tracking-[-0.01em]">
                                                            {cluster.title}
                                                        </p>
                                                        <p className="truncate text-[12px] text-muted-foreground">
                                                            {cluster.artist || "未知艺人"}
                                                            {cluster.source === "local"
                                                                ? " · 本地"
                                                                : " · 网易云"}
                                                            {canExpand
                                                                ? ` · ${cluster.memberCount} 个文件`
                                                                : ""}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="text-[13px] font-medium tabular-nums">
                                                            {cluster.playCount} 次
                                                        </p>
                                                        <p className="text-[11px] tabular-nums text-muted-foreground">
                                                            {formatDuration(cluster.totalMs)}
                                                        </p>
                                                    </div>
                                                </button>
                                            </div>

                                            {open && canExpand ? (
                                                <div className="mb-1 ml-10 space-y-0.5 border-l border-black/[0.06] pl-3 dark:border-white/[0.08]">
                                                    {cluster.members.map((member) => (
                                                        <div
                                                            key={member.trackId}
                                                            className="flex min-w-0 items-start gap-2 rounded-xl px-2 py-1.5"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-[12px] font-medium">
                                                                    {stripExtension(
                                                                        member.fileName ||
                                                                            member.title,
                                                                    )}
                                                                </p>
                                                                <p className="truncate text-[11px] text-muted-foreground">
                                                                    {member.filePath ||
                                                                        member.trackId}
                                                                    {member.contentHash
                                                                        ? ` · ${member.contentHash.slice(0, 8)}`
                                                                        : ""}
                                                                </p>
                                                            </div>
                                                            <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                                                <p>{member.playCount} 次</p>
                                                                <p>
                                                                    {formatDuration(
                                                                        member.totalMs,
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </Section>
                </>
            )}
        </div>
    )
}

function StatCard({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint: string
}) {
    return (
        <div className="material-panel rounded-[20px] px-4 py-3.5">
            <p className="text-[12px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
                {value}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </div>
    )
}

export { StatsPage }