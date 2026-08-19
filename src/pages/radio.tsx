import { Heart } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { DragList } from "@/components/music/drag-list"
import { RadioDetailSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { ViewModeToggle } from "@/components/music/view-mode-toggle"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import { formatDuration } from "@/lib/format"
import { setProgramSort, setProgramView } from "@/lib/library/layout-prefs"
import {
    ORDER_EVENT,
    getProgramOrder,
    setProgramOrder,
} from "@/lib/library/track-order"
import { PROGRAM_SORT_OPTIONS, sortPrograms } from "@/lib/library/sort"
import { fetchDjDetailWithPrograms } from "@/lib/netease/dj"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Radio, RadioProgram } from "@/lib/types"
import { cn } from "@/lib/utils"

type RadioPageProps = {
    radioId: string
    onBack: () => void
}

function RadioPage({ radioId, onBack }: RadioPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openRadioProgram } = useMusicNavigation()
    const { loggedIn } = useNeteaseSession()
    const { isRadioSubscribed, toggleRadioSubscribed } = useLiked()
    const { programSort, programView } = useLibraryLayout()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()
    const [radio, setRadio] = useState<Radio | null>(null)
    const [programs, setPrograms] = useState<RadioProgram[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    const [subBusy, setSubBusy] = useState(false)
    const [orderRevision, setOrderRevision] = useState(0)

    const subscribed = isRadioSubscribed(radioId)

    useEffect(() => {
        const syncOrder = () => setOrderRevision((value) => value + 1)
        window.addEventListener(ORDER_EVENT, syncOrder)
        window.addEventListener("storage", syncOrder)
        return () => {
            window.removeEventListener(ORDER_EVENT, syncOrder)
            window.removeEventListener("storage", syncOrder)
        }
    }, [])

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

    const sortedPrograms = useMemo(
        () =>
            sortPrograms(
                programs,
                programSort,
                getProgramOrder(radioId),
            ),
        [programs, programSort, radioId, orderRevision],
    )

    const queue = sortedPrograms.map((item) => item.track)
    const dragEnabled = programView === "list" && programSort === "custom"

    return (
        <div className="space-y-6 pb-2">
            <BackButton onClick={onBack} />

            {loading ? (
                <RadioDetailSkeleton />
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
                            <h1 className="line-clamp-2 break-words text-[28px] font-bold leading-tight tracking-[-0.04em] sm:text-[32px] md:font-semibold">
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
                                        className="h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
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
                                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50",
                                                subscribed
                                                    ? "glass-chip text-rose-600 dark:text-rose-300"
                                                    : "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
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
                                            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50",
                                            subscribed
                                                ? "glass-chip text-rose-600 dark:text-rose-300"
                                                : "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
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
                            <div className="flex flex-wrap items-center gap-2">
                                <SortSelect
                                    value={programSort}
                                    options={PROGRAM_SORT_OPTIONS}
                                    onChange={setProgramSort}
                                    label="节目排序"
                                />
                                <ViewModeToggle
                                    value={programView}
                                    onChange={setProgramView}
                                    label="节目展示"
                                />
                            </div>
                        }
                    >
                        {programs.length === 0 ? (
                            <StateHero variant="empty" title="暂无节目" />
                        ) : programView === "card" ? (
                            <div ref={gridRef} className={gridClass} style={gridStyle}>
                                {sortedPrograms.map((program) => {
                                    const active =
                                        currentTrack?.id === program.track.id
                                    return (
                                        <MediaCard
                                            key={program.id}
                                            coverUrl={program.coverUrl}
                                            title={program.title}
                                            subtitle={programSubtitle(program)}
                                            active={active}
                                            widthClassName="w-full"
                                            onClick={() =>
                                                openRadioProgram(
                                                    program.id,
                                                    program.radioId || radioId,
                                                )
                                            }
                                            overlay={
                                                active ? (
                                                    <div className="pointer-events-none absolute inset-0 bg-primary/[0.08]" />
                                                ) : null
                                            }
                                        />
                                    )
                                })}
                            </div>
                        ) : (
                            <DragList
                                items={sortedPrograms}
                                enabled={dragEnabled}
                                onReorder={(next) =>
                                    setProgramOrder(
                                        radioId,
                                        next.map((program) => program.id),
                                    )
                                }
                                className="apple-list-surface space-y-0.5 p-1.5"
                                renderItem={(program, index, handle) => {
                                    const active =
                                        currentTrack?.id === program.track.id
                                    return (
                                        <ProgramRow
                                            program={program}
                                            index={index}
                                            leading={handle}
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
                                }}
                            />
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
    leading,
    isActive,
    isPlaying,
    onOpen,
    onPlay,
}: {
    program: RadioProgram
    index: number
    leading?: ReactNode
    isActive: boolean
    isPlaying: boolean
    onOpen: () => void
    onPlay: () => void
}) {
    return (
        <div
            className={cn(
                "group flex w-full min-w-0 items-center gap-1 rounded-2xl transition-colors",
                isActive
                    ? "bg-[var(--surface-fill-hover)]"
                    : "hover:bg-[var(--surface-fill)]",
            )}
        >
            {leading ? <div className="ml-1 shrink-0">{leading}</div> : null}
            <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2">
            <button
                type="button"
                onClick={onPlay}
                className="relative shrink-0 cursor-pointer rounded-lg"
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
                className="min-w-0 cursor-pointer rounded-lg text-left"
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
        </div>
    )
}

function programSubtitle(program: RadioProgram): string {
    const owner = program.djName || program.radioTitle || "电台节目"
    const duration = formatDuration(program.durationMs)
    return program.listenerCount != null && program.listenerCount > 0
        ? `${owner} · ${formatListener(program.listenerCount)} 收听 · ${duration}`
        : `${owner} · ${duration}`
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