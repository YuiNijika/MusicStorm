// 统计图表 — 与 material-panel 同系，标题内嵌不与 Section 抢戏

import type { ReactNode } from "react"
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, XAxis } from "recharts"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import type { ListenSourceStat, ListenStats } from "@/lib/db/play-stats"
import { formatListenDuration } from "@/lib/format"
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
        color: "color-mix(in oklch, var(--primary) 40%, oklch(0.7 0.1 250))",
    },
    other: {
        label: "其他",
        color: "color-mix(in oklch, var(--muted-foreground) 48%, transparent)",
    },
} satisfies ChartConfig

const SOURCE_COLORS: Record<string, string> = {
    local: "var(--primary)",
    netease: "color-mix(in oklch, var(--primary) 40%, oklch(0.7 0.1 250))",
    other: "color-mix(in oklch, var(--muted-foreground) 50%, transparent)",
}

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

function ChartShell({
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
        <div className={cn("material-panel rounded-[22px] px-4 pt-4 pb-3", className)}>
            <div className="mb-3.5 flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                    {title}
                </p>
                {caption ? (
                    <p className="text-[12px] tabular-nums text-muted-foreground">
                        {caption}
                    </p>
                ) : null}
            </div>
            {children}
        </div>
    )
}

function ChartEmpty({ message }: { message: string }) {
    return (
        <p className="flex h-[160px] items-center justify-center text-[13px] text-muted-foreground">
            {message}
        </p>
    )
}

function StatsPlayTrendChart({ rows, className }: StatsTrendChartProps) {
    const data = toTrendPoints(rows)
    const empty = data.every((d) => d.plays === 0)
    const total = data.reduce((s, d) => s + d.plays, 0)

    return (
        <ChartShell
            title="播放"
            caption={empty ? undefined : `${total} 次`}
            className={className}
        >
            {empty ? (
                <ChartEmpty message="暂无数据" />
            ) : (
                <ChartContainer
                    config={trendConfig}
                    className="aspect-auto h-[160px] w-full"
                    initialDimension={{ width: 360, height: 160 }}
                >
                    <BarChart
                        data={data}
                        margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
                    >
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            tick={{
                                fontSize: 11,
                                fill: "color-mix(in oklch, var(--muted-foreground) 90%, transparent)",
                            }}
                            interval="preserveStartEnd"
                            minTickGap={20}
                        />
                        <ChartTooltip
                            cursor={{
                                fill: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                                radius: 8,
                            }}
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
                            maxBarSize={20}
                        />
                    </BarChart>
                </ChartContainer>
            )}
        </ChartShell>
    )
}

function StatsDurationTrendChart({ rows, className }: StatsTrendChartProps) {
    const data = toTrendPoints(rows)
    const empty = data.every((d) => d.totalMs === 0)
    const totalMs = data.reduce((s, d) => s + d.totalMs, 0)

    return (
        <ChartShell
            title="时长"
            caption={empty ? undefined : formatListenDuration(totalMs)}
            className={className}
        >
            {empty ? (
                <ChartEmpty message="暂无数据" />
            ) : (
                <ChartContainer
                    config={trendConfig}
                    className="aspect-auto h-[160px] w-full"
                    initialDimension={{ width: 360, height: 160 }}
                >
                    <AreaChart
                        data={data}
                        margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient
                                id="statsDurationFill"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor="var(--color-plays)"
                                    stopOpacity={0.32}
                                />
                                <stop
                                    offset="100%"
                                    stopColor="var(--color-plays)"
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            tick={{
                                fontSize: 11,
                                fill: "color-mix(in oklch, var(--muted-foreground) 90%, transparent)",
                            }}
                            interval="preserveStartEnd"
                            minTickGap={20}
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(_, payload) => {
                                        const day = payload?.[0]?.payload?.day
                                        return typeof day === "string" ? day : ""
                                    }}
                                    formatter={(_, __, item) => {
                                        const ms = Number(
                                            item?.payload?.totalMs ?? 0,
                                        )
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
                            activeDot={{ r: 3.5, strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ChartContainer>
            )}
        </ChartShell>
    )
}

type StatsSourceMixProps = {
    rows: ListenSourceStat[]
    className?: string
}

function StatsSourceMixChart({ rows, className }: StatsSourceMixProps) {
    const totalPlays = rows.reduce((sum, r) => sum + r.playCount, 0)
    const totalMs = rows.reduce((sum, r) => sum + r.totalMs, 0)
    const data = rows.map((r) => ({
        source: r.source,
        name: sourceLabel(r.source),
        playCount: r.playCount,
        totalMs: r.totalMs,
        value: r.playCount,
        color: SOURCE_COLORS[sourceColorKey(r.source)] ?? SOURCE_COLORS.other,
    }))
    const empty = totalPlays === 0

    return (
        <div className={cn("material-panel rounded-[22px] px-5 py-5", className)}>
            {empty ? (
                <p className="flex h-[148px] items-center justify-center text-[13px] text-muted-foreground">
                    播放后按本地与网易云汇总
                </p>
            ) : (
                <div className="flex flex-col items-center gap-7 sm:flex-row sm:gap-10">
                    <div className="relative shrink-0">
                        <ChartContainer
                            config={sourceConfig}
                            className="aspect-square h-[140px] w-[140px]"
                            initialDimension={{ width: 140, height: 140 }}
                        >
                            <PieChart>
                                <Pie
                                    data={data}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={42}
                                    outerRadius={62}
                                    strokeWidth={0}
                                    paddingAngle={2.5}
                                    cornerRadius={3}
                                >
                                    {data.map((entry) => (
                                        <Cell
                                            key={entry.source}
                                            fill={entry.color}
                                        />
                                    ))}
                                </Pie>
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            formatter={(value, name, item) => (
                                                <span className="tabular-nums">
                                                    {name} · {Number(value)} 次
                                                    ·{" "}
                                                    {formatListenDuration(
                                                        Number(
                                                            item?.payload
                                                                ?.totalMs ?? 0,
                                                        ),
                                                    )}
                                                </span>
                                            )}
                                        />
                                    }
                                />
                            </PieChart>
                        </ChartContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                合计
                            </p>
                            <p className="text-[17px] font-semibold tabular-nums tracking-tight">
                                {totalPlays}
                            </p>
                        </div>
                    </div>

                    <div className="w-full min-w-0 flex-1 space-y-4">
                        <p className="text-[13px] text-muted-foreground">
                            累计收听{" "}
                            <span className="font-medium text-foreground">
                                {formatListenDuration(totalMs)}
                            </span>
                        </p>
                        {data.map((entry) => {
                            const pct =
                                totalPlays > 0
                                    ? Math.round(
                                          (entry.playCount / totalPlays) * 100,
                                      )
                                    : 0
                            return (
                                <div key={entry.source} className="min-w-0">
                                    <div className="mb-1.5 flex items-center justify-between gap-3">
                                        <span className="flex items-center gap-2 text-[14px] tracking-[-0.01em]">
                                            <span
                                                className="size-2.5 shrink-0 rounded-full"
                                                style={{
                                                    background: entry.color,
                                                }}
                                            />
                                            {entry.name}
                                        </span>
                                        <span className="text-[13px] tabular-nums text-muted-foreground">
                                            <span className="font-semibold text-foreground">
                                                {pct}%
                                            </span>
                                            <span className="mx-1.5 opacity-30">
                                                ·
                                            </span>
                                            {entry.playCount} 次
                                        </span>
                                    </div>
                                    <div className="h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.1]">
                                        <div
                                            className="h-full rounded-full"
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