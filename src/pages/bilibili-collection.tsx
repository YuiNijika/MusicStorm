import { ExternalLink, Play, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { PlaylistDetailSkeleton } from "@/components/music/loading-skeletons"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { usePlayer } from "@/hooks/use-player"
import {
    fetchBilibiliCollectionDetail,
    fetchBilibiliCollectionTracksPage,
    type BilibiliCollectionDetail,
} from "@/lib/bilibili/search"
import { openExternalUrl } from "@/lib/open-external"
import { formatError } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type BilibiliCollectionPageProps = {
    mid: string
    collectionId: string
    kind: "season" | "series"
    onBack: () => void
}

const PAGE_SIZE = 20

function TrackList({
    tracks,
    currentTrackId,
    isPlaying,
    onPlay,
}: {
    tracks: Track[]
    currentTrackId?: string
    isPlaying: boolean
    onPlay: (track: Track) => void
}) {
    return (
        <div className="apple-list-surface min-w-0 p-1.5">
            {tracks.map((track, index) => (
                <TrackRow
                    key={track.id}
                    track={track}
                    index={index}
                    isActive={currentTrackId === track.id}
                    isPlaying={currentTrackId === track.id && isPlaying}
                    showSource={false}
                    showAlbumColumn={false}
                    showAlbumMeta={false}
                    showActions={false}
                    dense
                    onPlay={onPlay}
                />
            ))}
        </div>
    )
}

function BilibiliCollectionPage({
    mid,
    collectionId,
    kind,
    onBack,
}: BilibiliCollectionPageProps) {
    const { playTrack, playOrToggle, currentTrack, isPlaying } = usePlayer()
    const numericMid = Number(mid)
    const numericCollectionId = Number(collectionId)
    const [detail, setDetail] = useState<BilibiliCollectionDetail | null>(null)
    const [tracks, setTracks] = useState<Track[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [page, setPage] = useState(1)
    const [pageError, setPageError] = useState("")
    const [loadMoreError, setLoadMoreError] = useState("")
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        if (
            !Number.isSafeInteger(numericMid) ||
            numericMid <= 0 ||
            !Number.isSafeInteger(numericCollectionId) ||
            numericCollectionId <= 0
        ) {
            setLoading(false)
            setPageError("合集地址无效")
            return
        }
        let active = true
        setLoading(true)
        setPageError("")
        setLoadMoreError("")
        setTracks([])
        setHasMore(false)
        setPage(1)
        void Promise.all([
            fetchBilibiliCollectionDetail({
                mid: numericMid,
                collectionId: numericCollectionId,
                kind,
            }),
            fetchBilibiliCollectionTracksPage({
                mid: numericMid,
                collectionId: numericCollectionId,
                kind,
                page: 1,
                pageSize: PAGE_SIZE,
            }),
        ])
            .then(([nextDetail, result]) => {
                if (!active) {
                    return
                }
                setDetail(nextDetail)
                setTracks(result.tracks)
                setHasMore(result.hasMore)
                setPage(1)
            })
            .catch((reason: unknown) => {
                if (active) {
                    setDetail(null)
                    setTracks([])
                    setPageError(formatError(reason))
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false)
                }
            })
        return () => {
            active = false
        }
    }, [kind, numericCollectionId, numericMid, revision])

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore) {
            return
        }
        setLoadingMore(true)
        setLoadMoreError("")
        try {
            const nextPage = page + 1
            const result = await fetchBilibiliCollectionTracksPage({
                mid: numericMid,
                collectionId: numericCollectionId,
                kind,
                page: nextPage,
                pageSize: PAGE_SIZE,
            })
            setTracks((current) => {
                const seen = new Set(current.map((track) => track.id))
                return [
                    ...current,
                    ...result.tracks.filter((track) => !seen.has(track.id)),
                ]
            })
            setHasMore(result.hasMore)
            setPage(nextPage)
        } catch (reason) {
            setLoadMoreError(formatError(reason))
        } finally {
            setLoadingMore(false)
        }
    }, [
        hasMore,
        kind,
        loadingMore,
        numericCollectionId,
        numericMid,
        page,
    ])

    const displayTracks = tracks

    return (
        <div className="space-y-5 pb-4">
            <BackButton onClick={onBack} />
            {loading ? (
                <PlaylistDetailSkeleton />
            ) : pageError ? (
                <StateHero
                    variant="error"
                    title="合集加载失败"
                    description={pageError}
                    action={
                        <HeroRetryButton
                            onClick={() => setRevision((value) => value + 1)}
                        />
                    }
                />
            ) : detail ? (
                <>
                    <header className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
                        <Cover
                            src={detail.coverUrl}
                            alt={detail.title}
                            size="lg"
                            eager
                            className="size-32 shrink-0 rounded-[20px] shadow-[0_12px_28px_rgba(15,23,42,0.16)] ring-1 ring-black/[0.04] sm:size-36 sm:rounded-[24px] dark:shadow-[0_12px_28px_rgba(0,0,0,0.45)] dark:ring-white/[0.08]"
                        />
                        <div className="min-w-0 flex-1 space-y-2 pb-1">
                            <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase sm:text-[12px]">
                                {detail.kind === "season" ? "合集" : "系列"}
                            </p>
                            <h1 className="line-clamp-2 break-words text-[24px] leading-[1.15] font-bold tracking-[-0.04em] sm:text-[28px] md:text-[32px] md:font-semibold">
                                {detail.title}
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                {detail.count != null
                                    ? `${detail.count}个视频`
                                    : `${displayTracks.length}个视频`}
                            </p>
                            {detail.description ? (
                                <p className="mx-auto line-clamp-2 max-w-[560px] text-[13px] leading-relaxed text-muted-foreground sm:mx-0">
                                    {detail.description}
                                </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                                {displayTracks[0] ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            playTrack(displayTracks[0]!, displayTracks)
                                        }
                                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
                                    >
                                        <Play
                                            className="size-3.5 fill-current"
                                            aria-hidden="true"
                                        />
                                        播放全部
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void openExternalUrl(detail.webUrl)}
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                                >
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                    在B站打开
                                </button>
                            </div>
                        </div>
                    </header>

                    <section className="space-y-3">
                        <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
                            <div className="min-w-0">
                                <h2 className="text-[22px] font-bold tracking-[-0.03em] md:font-semibold">
                                    视频
                                </h2>
                                <p className="mt-0.5 text-[13px] text-muted-foreground">
                                    {displayTracks.length}个视频
                                </p>
                            </div>
                            {detail.count != null ? (
                                <p className="text-[12px] text-muted-foreground">
                                    共 {detail.count}个
                                </p>
                            ) : null}
                        </div>
                        {displayTracks.length === 0 ? (
                            <StateHero variant="empty" title="暂无视频" />
                        ) : (
                            <TrackList
                                tracks={displayTracks}
                                currentTrackId={currentTrack?.id}
                                isPlaying={isPlaying}
                                onPlay={(track) =>
                                    playOrToggle(track, displayTracks)
                                }
                            />
                        )}
                        {hasMore ? (
                            <div className="flex justify-center pt-1">
                                <button
                                    type="button"
                                    disabled={loadingMore}
                                    aria-busy={loadingMore}
                                    onClick={() =>
                                        void loadMore()
                                    }
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <RefreshCw
                                        className={cn(
                                            "size-3.5",
                                            loadingMore && "animate-spin",
                                        )}
                                        aria-hidden="true"
                                    />
                                    {loadingMore ? "加载中…" : "加载更多"}
                                </button>
                            </div>
                        ) : null}
                        {loadMoreError ? (
                            <p className="text-center text-[12px] text-destructive">
                                {loadMoreError}
                            </p>
                        ) : null}
                    </section>
                </>
            ) : null}
        </div>
    )
}

export { BilibiliCollectionPage }
