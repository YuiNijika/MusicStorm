import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, XAxis } from "recharts"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { formatListenDuration } from "@/lib/format"
import type { ListenSourceStat, ListenStats } from "@/lib/db/play-stats"
import { cn } from "@/lib/utils"

const trendConfig = {
    plays: {
        label: "播放",
        color: "var(--primary)",
    },
    minutes: {
        label: "时长",
        color: "color-mix(in oklch, var(--primary) 55%, transparent)",
    },
} satisfies ChartConfig

const sourceConfig = {
    local: {
        label: "本地",
        color: "var(--primary)",
    },
    netease: {
        label: "网易云",
        color: "color-mix(in oklch, var(--primary) 45%, oklch(0.7 0.08 250))",
    },
    other: {
        label: "其他",
        color: "color-mix(in oklch, var(--muted-foreground) 40%, transparent)",
    },
} satisfies ChartConfig

type TrendPoint = {
    day: string
    label: string
    plays: number
    minutes: number
    totalMs: number
}

function toTrendPoints(rows: ListenStats[]): TrendPoint[] {
    return rows.map((row) => ({
        day: row.day,
        label: row.day.slice(5),
        plays: row.playCount,
        minutes: Math.round(row.totalMs / 60_000),
        totalMs: row.totalMs,
    }))
}

function sourceLabel(source: string): string {
    if (source === "local") return "本地"
    if (source === "netease") return "网易云"
    return source || "其他"
}

function sourceColorKey(source: string): keyof typeof sourceConfig {
    if (source === "local") return "local"
    if (source === "netease") return "netease"
    return "other"
}

type StatsTrendChartProps = {
    rows: ListenStats[]
    className?: string
}

/** 近 N 日播放次数柱状图 */
function StatsPlayTrendChart({ rows, className }: StatsTrendChartProps) {
    const data = toTrendPoints(rows)
    const empty = data.every((d) => d.plays === 0)

    return (
        <div className={cn("material-panel rounded-[22px] px-4 py-4", className)}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium tracking-[-0.01em]">播放次数</p>
                <p className="text-[11px] text-muted-foreground">按日</p>
            </div>
            {empty ? (
                <p className="flex h-[140px] items-center justify-center text-[13px] text-muted-foreground">
                    暂无数据
                </p>
            ) : (
                <ChartContainer
                    config={trendConfig}
                    className="aspect-auto h-[140px] w-full"
                    initialDimension={{ width: 360, height: 140 }}
                >
                    <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 11 }}
                        />
                        <ChartTooltip
                            cursor={{ fill: "color-mix(in oklch, var(--foreground) 4%, transparent)" }}
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(_, payload) => {
                                        const day = payload?.[0]?.payload?.day
                                        return typeof day === "string" ? day : ""
                                    }}
                                    formatter={(value) => (
                                        <span className="font-medium tabular-nums">
                                            {Number(value)} 次
                                        </span>
                                    )}
                                />
                            }
                        />
                        <Bar
                            dataKey="plays"
                            fill="var(--color-plays)"
                            radius={[6, 6, 6, 6]}
                            maxBarSize={28}
                        />
                    </BarChart>
                </ChartContainer>
            )}
        </div>
    )
}

/** 近 N 日听歌时长面积图 */
function StatsDurationTrendChart({ rows, className }: StatsTrendChartProps) {
    const data = toTrendPoints(rows)
    const empty = data.every((d) => d.totalMs === 0)

    return (
        <div className={cn("material-panel rounded-[22px] px-4 py-4", className)}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium tracking-[-0.01em]">听歌时长</p>
                <p className="text-[11px] text-muted-foreground">按日</p>
            </div>
            {empty ? (
                <p className="flex h-[140px] items-center justify-center text-[13px] text-muted-foreground">
                    暂无数据
                </p>
            ) : (
                <ChartContainer
                    config={trendConfig}
                    className="aspect-auto h-[140px] w-full"
                    initialDimension={{ width: 360, height: 140 }}
                >
                    <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="statsDurationFill" x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="0%"
                                    stopColor="var(--color-minutes)"
                                    stopOpacity={0.45}
                                />
                                <stop
                                    offset="100%"
                                    stopColor="var(--color-minutes)"
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 11 }}
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(_, payload) => {
                                        const day = payload?.[0]?.payload?.day
                                        return typeof day === "string" ? day : ""
                                    }}
                                    formatter={(_, __, item) => {
                                        const ms = Number(item?.payload?.totalMs ?? 0)
                                        return (
                                            <span className="font-medium tabular-nums">
                                                {formatListenDuration(ms)}
                                            </span>
                                        )
                                    }}
                                />
                            }
                        />
                        <Area
                            type="monotone"
                            dataKey="minutes"
                            stroke="var(--color-plays)"
                            strokeWidth={2}
                            fill="url(#statsDurationFill)"
                        />
                    </AreaChart>
                </ChartContainer>
            )}
        </div>
    )
}

type StatsSourceMixProps = {
    rows: ListenSourceStat[]
    className?: string
}

const SOURCE_COLORS: Record<string, string> = {
    local: "var(--primary)",
    netease: "color-mix(in oklch, var(--primary) 45%, oklch(0.7 0.08 250))",
    other: "color-mix(in oklch, var(--muted-foreground) 50%, transparent)",
}

/** 本地 / 网易云 听歌占比 */
function StatsSourceMixChart({ rows, className }: StatsSourceMixProps) {
    const totalPlays = rows.reduce((sum, r) => sum + r.playCount, 0)
    const totalMs = rows.reduce((sum, r) => sum + r.totalMs, 0)
    const data = rows.map((r) => ({
        source: r.source,
        name: sourceLabel(r.source),
        key: sourceColorKey(r.source),
        playCount: r.playCount,
        totalMs: r.totalMs,
        value: r.playCount,
        color: SOURCE_COLORS[sourceColorKey(r.source)] ?? SOURCE_COLORS.other,
    }))
    const empty = totalPlays === 0

    return (
        <div className={cn("material-panel rounded-[22px] px-4 py-4", className)}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium tracking-[-0.01em]">来源占比</p>
                <p className="text-[11px] text-muted-foreground">
                    {empty ? "暂无" : `${totalPlays} 次 · ${formatListenDuration(totalMs)}`}
                </p>
            </div>
            {empty ? (
                <p className="flex h-[140px] items-center justify-center text-[13px] text-muted-foreground">
                    播放后按本地与网易云汇总
                </p>
            ) : (
                <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <ChartContainer
                        config={sourceConfig}
                        className="aspect-square h-[120px] w-[120px]"
                        initialDimension={{ width: 120, height: 120 }}
                    >
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={34}
                                outerRadius={52}
                                strokeWidth={0}
                                paddingAngle={2}
                            >
                                {data.map((entry) => (
                                    <Cell key={entry.source} fill={entry.color} />
                                ))}
                            </Pie>
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        formatter={(value, name, item) => (
                                            <span className="tabular-nums">
                                                {name} · {Number(value)} 次 ·{" "}
                                                {formatListenDuration(
                                                    Number(item?.payload?.totalMs ?? 0),
                                                )}
                                            </span>
                                        )}
                                    />
                                }
                            />
                        </PieChart>
                    </ChartContainer>
                    <div className="min-w-0 space-y-2.5">
                        {data.map((entry) => {
                            const pct =
                                totalPlays > 0
                                    ? Math.round((entry.playCount / totalPlays) * 100)
                                    : 0
                            return (
                                <div key={entry.source} className="min-w-0">
                                    <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <span
                                                className="size-2 shrink-0 rounded-full"
                                                style={{ background: entry.color }}
                                            />
                                            {entry.name}
                                        </span>
                                        <span className="tabular-nums text-foreground/90">
                                            {pct}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                                        <div
                                            className="h-full rounded-full transition-[width]"
                                            style={{
                                                width: `${pct}%`,
                                                background: entry.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

export { StatsDurationTrendChart, StatsPlayTrendChart, StatsSourceMixChart }