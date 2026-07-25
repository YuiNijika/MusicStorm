import { useEffect, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { DetailPageSkeleton } from "@/components/music/loading-skeletons"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { usePlayer } from "@/hooks/use-player"
import { fetchDjDetailWithPrograms } from "@/lib/netease/dj"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Radio, Track } from "@/lib/types"

type RadioPageProps = {
    radioId: string
    onBack: () => void
}

function RadioPage({ radioId, onBack }: RadioPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const [radio, setRadio] = useState<Radio | null>(null)
    const [tracks, setTracks] = useState<Track[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)

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
                setTracks(result.tracks)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setRadio(null)
                setTracks([])
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("电台加载失败", err)
            })
        return () => {
            cancelled = true
        }
    }, [radioId, retry])

    return (
        <div className="space-y-6">
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
                    <header className="flex flex-wrap items-end gap-5">
                        <Cover
                            src={radio.coverUrl}
                            alt={radio.title}
                            size="lg"
                            className="size-36 rounded-[24px] shadow-md"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <p className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                                播客电台
                                {radio.category ? ` · ${radio.category}` : ""}
                            </p>
                            <h1 className="text-[28px] font-semibold tracking-[-0.04em]">
                                {radio.title}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                                {radio.djName ? <span>{radio.djName}</span> : null}
                                {radio.programCount != null ? (
                                    <span>
                                        {radio.djName ? "· " : ""}
                                        {radio.programCount} 期
                                    </span>
                                ) : null}
                            </div>
                            {radio.description ? (
                                <p className="line-clamp-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                                    {radio.description}
                                </p>
                            ) : null}
                            {tracks[0] ? (
                                <div className="pt-1">
                                    <button
                                        type="button"
                                        onClick={() => playTrack(tracks[0], tracks)}
                                        className="h-9 cursor-pointer rounded-full bg-foreground px-5 text-[13px] font-medium text-background active:scale-[0.97]"
                                    >
                                        播放节目
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </header>

                    <Section title="节目" description={`${tracks.length} 期`}>
                        {tracks.length === 0 ? (
                            <StateHero variant="empty" title="暂无节目" />
                        ) : (
                            <div className="space-y-0.5 rounded-[22px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
                                {tracks.map((track, index) => (
                                    <TrackRow
                                        key={`${track.id}-${index}`}
                                        track={track}
                                        index={index}
                                        isActive={currentTrack?.id === track.id}
                                        isPlaying={
                                            currentTrack?.id === track.id && isPlaying
                                        }
                                        showSource={false}
                                        onPlay={(item) => playOrToggle(item, tracks)}
                                    />
                                ))}
                            </div>
                        )}
                    </Section>
                </>
            ) : null}
        </div>
    )
}

export { RadioPage }