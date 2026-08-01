import { ArrowUpDown, Heart } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { DetailPageSkeleton } from "@/components/music/loading-skeletons"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import { fetchDjDetailWithPrograms } from "@/lib/netease/dj"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Radio, RadioProgram } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 按电台 ID 记忆排序偏好，切换页面后恢复 */
const sortPrefs = new Map<string, boolean>()

type RadioPageProps = {
    radioId: string
    onBack: () => void
}

function RadioPage({ radioId, onBack }: RadioPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openRadioProgram } = useMusicNavigation()
    const { loggedIn } = useNeteaseSession()
    const { isRadioSubscribed, toggleRadioSubscribed } = useLiked()
    const [radio, setRadio] = useState<Radio | null>(null)
    const [programs, setPrograms] = useState<RadioProgram[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    const [subBusy, setSubBusy] = useState(false)
    const [sortAsc, setSortAsc] = useState(() => sortPrefs.get(radioId) ?? false)

    const subscribed = isRadioSubscribed(radioId)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        void fetchDjDetailWithPrograms(radioId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setRadio(result.radio)
                setPrograms(result.programs)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setRadio(null)
                setPrograms([])
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("电台加载失败", err)
            })
        return () => {
            cancelled = true
        }
    }, [radioId, retry])

    const sortedPrograms = useMemo(() => {
        if (!sortAsc) return programs
        return [...programs].reverse()
    }, [programs, sortAsc])

    const queue = sortedPrograms.map((item) => item.track)

    return (
        <div className="space-y-6 pb-2">
            <BackButton onClick={onBack} />

            {loading ? (
                <DetailPageSkeleton coverShape="rounded" />
            ) : error ? (
                <StateHero
                    variant="error"
                    title="电台加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : radio ? (
                <>
                    <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
                        <Cover
                            src={radio.coverUrl}
                            alt={radio.title}
                            size="lg"
                            className="size-40 shrink-0 rounded-[26px] shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04] sm:size-44 dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] dark:ring-white/[0.08]"
                        />
                        <div className="min-w-0 flex-1 space-y-2.5 pb-0.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                电台专栏
                                {radio.category ? ` · ${radio.category}` : ""}
                            </p>
                            <h1 className="line-clamp-2 break-words text-[28px] font-semibold leading-tight tracking-[-0.04em] sm:text-[32px]">
                                {radio.title}
                            </h1>
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                                {radio.djName ? (
                                    <span className="truncate">{radio.djName}</span>
                                ) : null}
                                {radio.programCount != null ? (
                                    <span className="shrink-0">
                                        {radio.djName ? "· " : ""}
                                        {radio.programCount} 期
                                    </span>
                                ) : (
                                    <span className="shrink-0">
                                        {radio.djName ? "· " : ""}
                                        {programs.length} 期
                                    </span>
                                )}
                            </div>
                            {radio.description ? (
                                <p className="line-clamp-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                                    {radio.description}
                                </p>
                            ) : null}
                            {queue[0] ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => playTrack(queue[0], queue)}
                                        className="h-9 cursor-pointer rounded-full bg-foreground px-5 text-[13px] font-medium text-background active:scale-[0.97]"
                                    >
                                        播放最新
                                    </button>
                                    {loggedIn ? (
                                        <button
                                            type="button"
                                            disabled={subBusy}
                                            onClick={() => {
                                                setSubBusy(true)
                                                void toggleRadioSubscribed(radioId).finally(
                                                    () => setSubBusy(false),
                                                )
                                            }}
                                            className={cn(
                                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium active:scale-[0.97]",
                                                subscribed
                                                    ? "glass-chip text-rose-600 dark:text-rose-300"
                                                    : "bg-black/[0.05] text-foreground dark:bg-white/[0.08]",
                                            )}
                                        >
                                            <Heart
                                                className={cn(
                                                    "size-3.5",
                                                    subscribed && "fill-current",
                                                )}
                                            />
                                            {subscribed ? "已订阅" : "订阅"}
                                        </button>
                                    ) : null}
                                </div>
                            ) : loggedIn ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <button
                                        type="button"
                                        disabled={subBusy}
                                        onClick={() => {
                                            setSubBusy(true)
                                            void toggleRadioSubscribed(radioId).finally(
                                                () => setSubBusy(false),
                                            )
                                        }}
                                        className={cn(
                                            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium active:scale-[0.97]",
                                            subscribed
                                                ? "glass-chip text-rose-600 dark:text-rose-300"
                                                : "bg-black/[0.05] text-foreground dark:bg-white/[0.08]",
                                        )}
                                    >
                                        <Heart
                                            className={cn(
                                                "size-3.5",
                                                subscribed && "fill-current",
                                            )}
                                        />
                                        {subscribed ? "已订阅" : "订阅"}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </header>

                    <Section
                        title="节目"
                        description={`${programs.length} 期`}
                        action={
                            <button
                                type="button"
                                onClick={() =>
                                    setSortAsc((v) => {
                                        const next = !v
                                        sortPrefs.set(radioId, next)
                                        return next
                                    })
                                }
                                className={cn(
                                    "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                                    sortAsc
                                        ? "bg-foreground text-background"
                                        : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
                                )}
                                title={sortAsc ? "正序" : "倒序"}
                            >
                                <ArrowUpDown className="size-3" />
                                {sortAsc ? "正序" : "倒序"}
                            </button>
                        }
                    >
                        {programs.length === 0 ? (
                            <StateHero variant="empty" title="暂无节目" />
                        ) : (
                            <div className="space-y-0.5 overflow-hidden rounded-[22px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
                                {sortedPrograms.map((program, index) => {
                                    const active =
                                        currentTrack?.id === program.track.id
                                    return (
                                        <ProgramRow
                                            key={program.id}
                                            program={program}
                                            index={index}
                                            isActive={active}
                                            isPlaying={active && isPlaying}
                                            onOpen={() =>
                                                openRadioProgram(
                                                    program.id,
                                                    program.radioId || radioId,
                                                )
                                            }
                                            onPlay={() =>
                                                playOrToggle(program.track, queue)
                                            }
                                        />
                                    )
                                })}
                            </div>
                        )}
                    </Section>
                </>
            ) : null}
        </div>
    )
}

function ProgramRow({
    program,
    index,
    isActive,
    isPlaying,
    onOpen,
    onPlay,
}: {
    program: RadioProgram
    index: number
    isActive: boolean
    isPlaying: boolean
    onOpen: () => void
    onPlay: () => void
}) {
    return (
        <div
            className={cn(
                "group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors",
                isActive
                    ? "bg-black/[0.05] dark:bg-white/[0.08]"
                    : "hover:bg-black/[0.035] dark:hover:bg-white/[0.05]",
            )}
        >
            <button
                type="button"
                onClick={onPlay}
                className="relative shrink-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title={isPlaying ? "暂停" : "播放"}
            >
                <Cover
                    src={program.coverUrl}
                    alt={program.title}
                    size="sm"
                    className="rounded-lg"
                />
            </button>
            <button
                type="button"
                onClick={onOpen}
                className="min-w-0 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 text-[12px] tabular-nums text-muted-foreground">
                        {index + 1}
                    </span>
                    <p
                        className={cn(
                            "min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em]",
                            isActive ? "text-primary" : "text-foreground",
                        )}
                    >
                        {program.title}
                    </p>
                </div>
                <p className="mt-0.5 truncate pl-7 text-[12px] text-muted-foreground">
                    {program.djName || program.radioTitle || "电台节目"}
                    {program.listenerCount != null && program.listenerCount > 0
                        ? ` · ${formatListener(program.listenerCount)} 收听`
                        : ""}
                </p>
            </button>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                {formatDuration(program.durationMs)}
            </span>
        </div>
    )
}

function formatListener(count: number): string {
    if (count >= 100_000_000) {
        return `${(count / 100_000_000).toFixed(1)} 亿`
    }
    if (count >= 10_000) {
        return `${(count / 10_000).toFixed(1)} 万`
    }
    return String(count)
}

export { RadioPage }