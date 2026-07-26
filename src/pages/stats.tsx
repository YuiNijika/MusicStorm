import { ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Cover } from "@/components/music/cover"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { StateHero } from "@/components/music/state-hero"
import {
    getListenStats,
    listListenStats,
    listTopTrackClusters,
    type ListenStats,
    type TopTrackCluster,
} from "@/lib/db/play-stats"
import { formatDuration } from "@/lib/format"
import { stripExtension } from "@/lib/local/audio-formats"
import { cn } from "@/lib/utils"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function emptyDay(day: string): ListenStats {
    return { day, playCount: 0, uniqueTracks: 0, totalMs: 0 }
}

/** 补全近 N 日空数据，便于条形图 */
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

function StatsPage() {
    const [today, setToday] = useState<ListenStats | null>(null)
    const [recent, setRecent] = useState<ListenStats[]>([])
    const [topTracks, setTopTracks] = useState<TopTrackCluster[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
    const tauri = isTauriRuntime()

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        void (async () => {
            if (!isTauriRuntime()) {
                if (!cancelled) {
                    setToday(null)
                    setRecent([])
                    setTopTracks([])
                    setLoading(false)
                }
                return
            }
            const [day, list, tops] = await Promise.all([
                getListenStats(),
                listListenStats(7),
                listTopTrackClusters(20, null),
            ])
            if (cancelled) {
                return
            }
            setToday(day)
            setRecent(fillRecentDays(list, 7))
            setTopTracks(tops)
            setLoading(false)
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const maxPlays = useMemo(
        () => Math.max(1, ...recent.map((row) => row.playCount)),
        [recent],
    )

    const weekTotal = useMemo(
        () =>
            recent.reduce(
                (acc, row) => ({
                    plays: acc.plays + row.playCount,
                    ms: acc.ms + row.totalMs,
                    unique: Math.max(acc.unique, row.uniqueTracks),
                }),
                { plays: 0, ms: 0, unique: 0 },
            ),
        [recent],
    )

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

    return (
        <div className="space-y-6 pb-4">
            <PageTitle
                title="统计"
                subtitle="听歌时长、次数与最常听的歌曲"
            />

            {!tauri ? (
                <StateHero
                    variant="empty"
                    title="仅桌面端可用"
                    description="听歌统计写入本机数据库，请在 MusicStorm 桌面应用中查看"
                />
            ) : loading ? (
                <div className="material-panel h-32 animate-pulse rounded-[20px]" />
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatCard
                            label="今日播放"
                            value={String(today?.playCount ?? 0)}
                            hint="有效听歌次数（≥30s 或完整）"
                        />
                        <StatCard
                            label="今日曲目"
                            value={String(today?.uniqueTracks ?? 0)}
                            hint="按曲目 id 去重"
                        />
                        <StatCard
                            label="今日时长"
                            value={formatDuration(today?.totalMs ?? 0)}
                            hint="累计收听"
                        />
                    </div>

                    <Section
                        title="近 7 日"
                        description={`共 ${weekTotal.plays} 次 · ${formatDuration(weekTotal.ms)}`}
                    >
                        {recent.every((row) => row.playCount === 0) ? (
                            <StateHero
                                variant="empty"
                                title="暂无数据"
                                description="播放超过约 30 秒或完整听完后会记入"
                            />
                        ) : (
                            <div className="material-panel space-y-3 rounded-[20px] px-4 py-4">
                                {recent.map((row) => (
                                    <div
                                        key={row.day}
                                        className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3"
                                    >
                                        <span className="text-[12px] tabular-nums text-muted-foreground">
                                            {row.day.slice(5)}
                                        </span>
                                        <div className="h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full bg-primary/80 transition-[width]",
                                                    row.playCount === 0 && "bg-transparent",
                                                )}
                                                style={{
                                                    width: `${(row.playCount / maxPlays) * 100}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="min-w-[5.5rem] text-right text-[12px] tabular-nums text-muted-foreground">
                                            {row.playCount} 次
                                            {row.totalMs > 0
                                                ? ` · ${formatDuration(row.totalMs)}`
                                                : ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section
                        title="听得最多"
                        description="本地同内容或同名会合并显示，展开可看分别记录"
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
                                            <button
                                                type="button"
                                                disabled={!canExpand}
                                                onClick={() =>
                                                    canExpand && toggleExpand(cluster.key)
                                                }
                                                className={cn(
                                                    "flex w-full min-w-0 items-center gap-3 rounded-[16px] px-2.5 py-2 text-left",
                                                    canExpand &&
                                                        "cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                                                    !canExpand && "cursor-default",
                                                )}
                                            >
                                                <span className="w-6 shrink-0 text-center text-[12px] tabular-nums text-muted-foreground">
                                                    {index + 1}
                                                </span>
                                                <Cover
                                                    src={cluster.coverUrl}
                                                    alt=""
                                                    size="sm"
                                                    className="size-10 shrink-0 rounded-xl"
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
                                                {canExpand ? (
                                                    open ? (
                                                        <ChevronDown className="size-4 shrink-0 opacity-50" />
                                                    ) : (
                                                        <ChevronRight className="size-4 shrink-0 opacity-50" />
                                                    )
                                                ) : (
                                                    <span className="size-4 shrink-0" />
                                                )}
                                            </button>

                                            {open && canExpand ? (
                                                <div className="mb-1 ml-9 space-y-0.5 border-l border-black/[0.06] pl-3 dark:border-white/[0.08]">
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
                                                                        ? ` · md5 ${member.contentHash.slice(0, 8)}…`
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