// 统计图表：纯渲染层，卡片外壳与标题由统计页统一提供

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

// Apple Health 式柱图配色：历史柱压灰，今日柱用主题色高亮
const BAR_MUTED = "color-mix(in oklab, var(--muted-foreground) 30%, transparent)"

type TrendPoint = {
    day: string
    label: string
    plays: number
    minutes: number
    totalMs: number
}

function todayKey(): string {
    return new Date().toISOString().slice(0, 10)
}

// 一周内的序列用星期几做刻度，更长的序列退回月日
function toTrendPoints(rows: ListenStats[]): TrendPoint[] {
    const compact = rows.length <= 8
    return rows.map((row) => {
        let label = row.day.slice(5)
        if (compact) {
            const d = new Date(`${row.day}T00:00:00`)
            if (!Number.isNaN(d.getTime())) {
                label = `周${"日一二三四五六".charAt(d.getDay())}`
            }
        }
        return {
            day: row.day,
            label,
            plays: row.playCount,
            minutes: Math.round(row.totalMs / 60_000),
            totalMs: row.totalMs,
        }
    })
}

function barFill(day: string, tKey: string, hasToday: boolean): string {
    if (!hasToday || day === tKey) {
        return "var(--color-plays)"
    }
    return BAR_MUTED
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

function ChartEmpty({ message }: { message: string }) {
    return (
        <p className="flex h-[176px] items-center justify-center text-[13px] text-muted-foreground">
            {message}
        </p>
    )
}

function TrendXAxis() {
    return (
        <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={9}
            tick={{
                fontSize: 11,
                fill: "color-mix(in oklch, var(--muted-foreground) 85%, transparent)",
            }}
            interval="preserveStartEnd"
            minTickGap={16}
        />
    )
}

type StatsTrendChartProps = {
    rows: ListenStats[]
    className?: string
}

function StatsPlayTrendChart({ rows, className }: StatsTrendChartProps) {
    const data = toTrendPoints(rows)
    const empty = data.every((d) => d.plays === 0)
    if (empty) {
        return <ChartEmpty message="这段时间还没有播放记录" />
    }
    const tKey = todayKey()
    const hasToday = data.some((d) => d.day === tKey)

    return (
        <ChartContainer
            config={trendConfig}
            className={cn("aspect-auto h-[176px] w-full", className)}
            initialDimension={{ width: 360, height: 176 }}
        >
            <BarChart data={data} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
                <TrendXAxis />
                <ChartTooltip
                    cursor={{
                        fill: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                        radius: 6,
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
                <Bar dataKey="plays" radius={[5, 5, 5, 5]} maxBarSize={18}>
                    {data.map((entry) => (
                        <Cell
                            key={entry.day}
                            fill={barFill(entry.day, tKey, hasToday)}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ChartContainer>
    )
}

function StatsDurationTrendChart({ rows, className }: StatsTrendChartProps) {
    const data = toTrendPoints(rows)
    const empty = data.every((d) => d.totalMs === 0)
    if (empty) {
        return <ChartEmpty message="这段时间还没有收听时长" />
    }

    return (
        <ChartContainer
            config={trendConfig}
            className={cn("aspect-auto h-[176px] w-full", className)}
            initialDimension={{ width: 360, height: 176 }}
        >
            <AreaChart data={data} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
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
                            stopOpacity={0.28}
                        />
                        <stop
                            offset="100%"
                            stopColor="var(--color-plays)"
                            stopOpacity={0.02}
                        />
                    </linearGradient>
                </defs>
                <TrendXAxis />
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
                    activeDot={{ r: 3.5, strokeWidth: 0 }}
                />
            </AreaChart>
        </ChartContainer>
    )
}

type StatsSourceMixProps = {
    rows: ListenSourceStat[]
    className?: string
}

function StatsSourceMixChart({ rows, className }: StatsSourceMixProps) {
    const totalPlays = rows.reduce((sum, r) => sum + r.playCount, 0)
    const data = rows.map((r) => ({
        source: r.source,
        name: sourceLabel(r.source),
        playCount: r.playCount,
        totalMs: r.totalMs,
        value: r.playCount,
        color: SOURCE_COLORS[sourceColorKey(r.source)] ?? SOURCE_COLORS.other,
    }))
    const empty = totalPlays === 0
    if (empty) {
        return <ChartEmpty message="播放后按本地与网易云汇总" />
    }

    return (
        <div className={cn("flex h-full flex-col justify-center", className)}>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                <div className="relative shrink-0">
                    <ChartContainer
                        config={sourceConfig}
                        className="aspect-square h-[124px] w-[124px]"
                        initialDimension={{ width: 124, height: 124 }}
                    >
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={37}
                                outerRadius={57}
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
                                                        item?.payload?.totalMs ??
                                                            0,
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
                        <p className="text-[18px] font-semibold tabular-nums tracking-tight">
                            {totalPlays}
                        </p>
                    </div>
                </div>

                <div className="w-full min-w-0 flex-1 space-y-4">
                    {data.map((entry) => {
                        const pct =
                            totalPlays > 0
                                ? Math.round(
                                      (entry.playCount / totalPlays) * 100,
                                  )
                                : 0
                        return (
                            <div key={entry.source} className="min-w-0">
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{ background: entry.color }}
                                        />
                                        <span className="truncate tracking-[-0.01em]">
                                            {entry.name}
                                        </span>
                                    </span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">
                                        <span className="font-semibold text-foreground">
                                            {pct}%
                                        </span>
                                        <span className="mx-1.5 opacity-40">
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
        </div>
    )
}

export { StatsDurationTrendChart, StatsPlayTrendChart, StatsSourceMixChart }
