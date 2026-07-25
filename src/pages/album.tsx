import { useEffect, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { DetailPageSkeleton } from "@/components/music/loading-skeletons"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { usePlayer } from "@/hooks/use-player"
import { fetchAlbumDetail, type AlbumProfile } from "@/lib/netease/album"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Track } from "@/lib/types"

type AlbumPageProps = {
    albumId: string
    onBack: () => void
}

function AlbumPage({ albumId, onBack }: AlbumPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openArtist } = useMusicNavigation()
    const [profile, setProfile] = useState<AlbumProfile | null>(null)
    const [tracks, setTracks] = useState<Track[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        void fetchAlbumDetail(albumId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setProfile(result.profile)
                setTracks(result.tracks)
                setLoading(false)
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setProfile(null)
                setTracks([])
                setLoading(false)
                const message = formatError(error)
                setError(message)
                notifyFromError("专辑加载失败", error)
            })
        return () => {
            cancelled = true
        }
    }, [albumId, retry])

    return (
        <div className="space-y-6">
            <BackButton onClick={onBack} />

            {loading ? (
                <DetailPageSkeleton coverShape="rounded" />
            ) : error ? (
                <StateHero
                    variant="error"
                    title="专辑加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : profile ? (
                <>
                    <header className="flex flex-wrap items-end gap-5">
                        <Cover
                            src={profile.coverUrl}
                            alt={profile.title}
                            size="lg"
                            className="size-36 rounded-[24px] shadow-md"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <p className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                                专辑
                            </p>
                            <h1 className="text-[32px] font-semibold tracking-[-0.04em]">
                                {profile.title}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                                {profile.artistId ? (
                                    <button
                                        type="button"
                                        onClick={() => openArtist(profile.artistId!)}
                                        className="cursor-pointer font-medium text-foreground/90 underline-offset-2 hover:underline"
                                    >
                                        {profile.artistName}
                                    </button>
                                ) : (
                                    <span>{profile.artistName}</span>
                                )}
                                {profile.year ? <span>· {profile.year}</span> : null}
                                <span>
                                    · {profile.trackCount ?? tracks.length} 首
                                </span>
                            </div>
                            {profile.description ? (
                                <p className="line-clamp-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                                    {profile.description}
                                </p>
                            ) : null}
                            {tracks[0] ? (
                                <button
                                    type="button"
                                    onClick={() => playTrack(tracks[0], tracks)}
                                    className="mt-1 h-9 cursor-pointer rounded-full bg-foreground px-5 text-[13px] font-medium text-background active:scale-[0.97]"
                                >
                                    播放全部
                                </button>
                            ) : null}
                        </div>
                    </header>

                    <Section title="曲目">
                        {tracks.length === 0 ? (
                            <StateHero variant="empty" title="暂无曲目" />
                        ) : (
                            <div className="space-y-0.5 rounded-[22px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
                                {tracks.map((track, index) => (
                                    <TrackRow
                                        key={track.id}
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

export { AlbumPage }