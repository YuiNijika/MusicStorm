import { Heart } from "lucide-react"
import { useEffect, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { DetailPageSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { Section } from "@/components/music/section"
import { SourceBadge } from "@/components/music/source-badge"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLiked } from "@/hooks/use-liked"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import { fetchPlaylistDetail } from "@/lib/netease/playlist"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Playlist, Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type PlaylistPageProps = {
    playlistId: string
    onBack: () => void
}

function PlaylistPage({ playlistId, onBack }: PlaylistPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { loggedIn } = useNeteaseSession()
    const { playlistTracksView } = useLibraryLayout()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()
    const {
        likedSongPlaylistId,
        isPlaylistSubscribed,
        togglePlaylistSubscribed,
    } = useLiked()
    const [playlist, setPlaylist] = useState<Playlist | null>(null)
    const [tracks, setTracks] = useState<Track[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorText, setErrorText] = useState<string | null>(null)
    const [subBusy, setSubBusy] = useState(false)
    const [retry, setRetry] = useState(0)

    const isOwnLiked = playlistId === likedSongPlaylistId
    const subscribed = isPlaylistSubscribed(playlistId) || isOwnLiked

    useEffect(() => {
        let cancelled = false
        setIsLoading(true)
        setErrorText(null)

        void fetchPlaylistDetail(playlistId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setPlaylist(result.playlist)
                setTracks(result.tracks)
                setIsLoading(false)
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setPlaylist(null)
                setTracks([])
                setIsLoading(false)
                const message =
                    formatError(error) || "歌单加载失败，请确认网易云接口可用"
                setErrorText(message)
                notifyFromError("歌单加载失败", error)
            })

        return () => {
            cancelled = true
        }
    }, [playlistId, retry])

    async function handleToggleSubscribe() {
        if (!loggedIn || isOwnLiked || subBusy) {
            return
        }
        setSubBusy(true)
        try {
            await togglePlaylistSubscribed(playlistId)
        } catch {
            // 乐观回滚已在 store
        } finally {
            setSubBusy(false)
        }
    }

    return (
        <div className="space-y-6">
            <BackButton onClick={onBack} />

            {isLoading ? (
                <DetailPageSkeleton coverShape="rounded" />
            ) : errorText ? (
                <StateHero
                    variant="error"
                    title="歌单加载失败"
                    description={errorText}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : playlist ? (
                <>
                    <header className="flex flex-wrap items-end gap-5">
                        <Cover
                            src={playlist.coverUrl}
                            alt={playlist.title}
                            size="lg"
                            className="size-36 rounded-[24px]"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <div className="flex items-center gap-2">
                                <SourceBadge source={playlist.source} />
                                <span className="text-[12px] text-muted-foreground">
                                    {playlist.trackCount ?? tracks.length} 首
                                </span>
                            </div>
                            <h1 className="text-[28px] font-semibold tracking-[-0.04em]">
                                {playlist.title}
                            </h1>
                            {playlist.description ? (
                                <p className="line-clamp-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                                    {playlist.description}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                {tracks[0] ? (
                                    <button
                                        type="button"
                                        onClick={() => playTrack(tracks[0], tracks)}
                                        className="h-9 cursor-pointer rounded-full bg-foreground px-5 text-[13px] font-medium text-background active:scale-[0.97]"
                                    >
                                        播放全部
                                    </button>
                                ) : null}
                                {loggedIn && !isOwnLiked ? (
                                    <button
                                        type="button"
                                        disabled={subBusy}
                                        onClick={() => void handleToggleSubscribe()}
                                        className={cn(
                                            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors active:scale-[0.97] disabled:opacity-50",
                                            subscribed
                                                ? "bg-primary/15 text-primary"
                                                : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08]",
                                        )}
                                    >
                                        <Heart
                                            className={cn(
                                                "size-3.5",
                                                subscribed && "fill-current",
                                            )}
                                        />
                                        {subscribed ? "已收藏" : "收藏歌单"}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </header>

                    <Section title="歌曲" description={`${tracks.length} 首`}>
                        {tracks.length === 0 ? (
                            <StateHero variant="empty" title="暂无歌曲" />
                        ) : playlistTracksView === "card" ? (
                            <div ref={gridRef} className={gridClass} style={gridStyle}>
                                {tracks.map((track) => (
                                    <MediaCard
                                        key={track.id}
                                        coverUrl={track.coverUrl}
                                        title={track.title}
                                        subtitle={track.artist}
                                        widthClassName="w-full"
                                        active={currentTrack?.id === track.id}
                                        onClick={() => playOrToggle(track, tracks)}
                                    />
                                ))}
                            </div>
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

export { PlaylistPage }