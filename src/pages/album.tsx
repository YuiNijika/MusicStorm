import { Heart } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { AlbumDetailSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
import { ViewModeToggle } from "@/components/music/view-mode-toggle"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    setAlbumTracksView,
    setTrackSort,
} from "@/lib/library/layout-prefs"
import { sortTracks, TRACK_SORT_OPTIONS } from "@/lib/library/sort"
import { resolveTrackCoverUrl } from "@/lib/music/cover-overrides"
import { fetchAlbumDetail, type AlbumProfile } from "@/lib/netease/album"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type AlbumPageProps = {
    albumId: string
    onBack: () => void
}

function AlbumPage({ albumId, onBack }: AlbumPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openArtist } = useMusicNavigation()
    const { loggedIn } = useNeteaseSession()
    const { isAlbumSubscribed, toggleAlbumSubscribed } = useLiked()
    const { albumTracksView, trackSort } = useLibraryLayout()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()

    const [profile, setProfile] = useState<AlbumProfile | null>(null)
    const [tracks, setTracks] = useState<Track[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    const [subBusy, setSubBusy] = useState(false)

    const subscribed = isAlbumSubscribed(albumId)
    const sortedTracks = useMemo(
        () => sortTracks(tracks, trackSort),
        [tracks, trackSort],
    )

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
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setProfile(null)
                setTracks([])
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("专辑加载失败", err)
            })
        return () => {
            cancelled = true
        }
    }, [albumId, retry])

    async function handleToggleSubscribe() {
        if (!loggedIn || subBusy) {
            return
        }
        setSubBusy(true)
        try {
            await toggleAlbumSubscribed(albumId)
        } catch {
            // store 已回滚
        } finally {
            setSubBusy(false)
        }
    }

    return (
        <div className="space-y-6 pb-2">
            <BackButton onClick={onBack} />

            {loading ? (
                <AlbumDetailSkeleton />
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
                    <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
                        <Cover
                            src={profile.coverUrl}
                            alt={profile.title}
                            size="lg"
                            className="size-40 shrink-0 rounded-[26px] shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04] sm:size-44 dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] dark:ring-white/[0.08]"
                        />
                        <div className="min-w-0 flex-1 space-y-2.5 pb-0.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                专辑
                            </p>
                            <h1 className="line-clamp-2 break-words text-[28px] font-semibold leading-tight tracking-[-0.04em] sm:text-[32px]">
                                {profile.title}
                            </h1>
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                                {profile.artistId ? (
                                    <button
                                        type="button"
                                        onClick={() => openArtist(profile.artistId!)}
                                        className="max-w-full cursor-pointer truncate font-medium text-foreground/90 underline-offset-2 hover:underline"
                                    >
                                        {profile.artistName}
                                    </button>
                                ) : (
                                    <span className="truncate">{profile.artistName}</span>
                                )}
                                {profile.year ? (
                                    <span className="shrink-0">· {profile.year}</span>
                                ) : null}
                                <span className="shrink-0">
                                    · {profile.trackCount ?? sortedTracks.length} 首
                                </span>
                            </div>
                            {profile.description ? (
                                <p className="line-clamp-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                                    {profile.description}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {sortedTracks[0] ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            playTrack(sortedTracks[0], sortedTracks)
                                        }
                                        className="h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
                                    >
                                        播放全部
                                    </button>
                                ) : null}
                                {loggedIn ? (
                                    <button
                                        type="button"
                                        disabled={subBusy}
                                        onClick={() => void handleToggleSubscribe()}
                                        className={cn(
                                            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50",
                                            subscribed
                                                ? "bg-primary/15 text-primary"
                                                : "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
                                        )}
                                    >
                                        <Heart
                                            className={cn(
                                                "size-3.5",
                                                subscribed && "fill-current",
                                            )}
                                        />
                                        {subscribed ? "已收藏" : "收藏专辑"}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </header>

                    <Section
                        title="曲目"
                        description={`${sortedTracks.length} 首`}
                        action={
                            <div className="flex flex-wrap items-center gap-2">
                                <SortSelect
                                    value={trackSort}
                                    options={TRACK_SORT_OPTIONS}
                                    onChange={setTrackSort}
                                />
                                <ViewModeToggle
                                    value={albumTracksView}
                                    onChange={setAlbumTracksView}
                                />
                            </div>
                        }
                    >
                        {sortedTracks.length === 0 ? (
                            <StateHero variant="empty" title="暂无曲目" />
                        ) : albumTracksView === "card" ? (
                            <div ref={gridRef} className={gridClass} style={gridStyle}>
                                {sortedTracks.map((track) => (
                                    <MediaCard
                                        key={track.id}
                                        title={track.title}
                                        subtitle={track.artist}
                                        coverUrl={resolveTrackCoverUrl(
                                            track.id,
                                            track.coverUrl,
                                            "thumbnail",
                                        )}
                                        active={currentTrack?.id === track.id}
                                        onClick={() =>
                                            playOrToggle(track, sortedTracks)
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <VirtualList
                                items={sortedTracks}
                                itemHeight={58}
                                className="apple-list-surface p-1.5"
                                getItemKey={(track) => track.id}
                                renderItem={(track, index) => (
                                    <TrackRow
                                        track={track}
                                        index={index}
                                        isActive={currentTrack?.id === track.id}
                                        isPlaying={
                                            currentTrack?.id === track.id && isPlaying
                                        }
                                        showSource={false}
                                        showAlbumColumn={false}
                                        showAlbumMeta={false}
                                        onPlay={(item) =>
                                            playOrToggle(item, sortedTracks)
                                        }
                                    />
                                )}
                            />
                        )}
                    </Section>
                </>
            ) : null}
        </div>
    )
}

export { AlbumPage }