import { useEffect, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { RadioProgramDetailSkeleton } from "@/components/music/loading-skeletons"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { usePlayer } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import { fetchDjProgramDetail } from "@/lib/netease/dj"
import { formatError, notifyFromError } from "@/lib/notify"
import type { RadioProgram } from "@/lib/types"

type RadioProgramPageProps = {
    programId: string
    radioId?: string
    onBack: () => void
}

function RadioProgramPage({
    programId,
    radioId,
    onBack,
}: RadioProgramPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openRadio } = useMusicNavigation()
    const [program, setProgram] = useState<RadioProgram | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        void fetchDjProgramDetail(programId, radioId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setProgram(result)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setProgram(null)
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("节目加载失败", err)
            })
        return () => {
            cancelled = true
        }
    }, [programId, radioId, retry])

    const active = program
        ? currentTrack?.id === program.track.id
        : false

    return (
        <div className="space-y-6 pb-2">
            <BackButton onClick={onBack} />

            {loading ? (
                <RadioProgramDetailSkeleton />
            ) : error ? (
                <StateHero
                    variant="error"
                    title="节目加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : program ? (
                <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
                    <Cover
                        src={program.coverUrl}
                        alt={program.title}
                        size="lg"
                        className="size-40 shrink-0 rounded-[26px] shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04] sm:size-44 dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] dark:ring-white/[0.08]"
                    />
                    <div className="min-w-0 flex-1 space-y-2.5 pb-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            电台节目
                        </p>
                        <h1 className="line-clamp-3 break-words text-[26px] font-semibold leading-tight tracking-[-0.04em] sm:text-[30px]">
                            {program.title}
                        </h1>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                            {program.radioId ? (
                                <button
                                    type="button"
                                    onClick={() => openRadio(program.radioId!)}
                                    className="max-w-full cursor-pointer truncate font-medium text-foreground/90 underline-offset-2 hover:underline"
                                >
                                    {program.radioTitle || "所属电台"}
                                </button>
                            ) : program.radioTitle ? (
                                <span className="truncate">{program.radioTitle}</span>
                            ) : null}
                            {program.djName ? (
                                <span className="truncate">
                                    · {program.djName}
                                </span>
                            ) : null}
                            <span className="shrink-0">
                                · {formatDuration(program.durationMs)}
                            </span>
                        </div>
                        {program.description ? (
                            <p className="line-clamp-6 max-w-2xl whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                                {program.description}
                            </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() =>
                                    playOrToggle(program.track, [program.track])
                                }
                                className="h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium active:scale-[0.98]"
                            >
                                {active && isPlaying ? "暂停" : "播放"}
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    playTrack(program.track, [program.track])
                                }
                                className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[13px] font-medium active:scale-[0.97] dark:bg-white/[0.08]"
                            >
                                从头播放
                            </button>
                        </div>
                    </div>
                </header>
            ) : null}
        </div>
    )
}

export { RadioProgramPage }