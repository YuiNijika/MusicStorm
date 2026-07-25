import { Pause, Play } from "lucide-react"
import type { KeyboardEvent, MouseEvent } from "react"

import { Cover } from "@/components/music/cover"
import { SourceBadge } from "@/components/music/source-badge"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { formatDuration } from "@/lib/format"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type TrackRowProps = {
    track: Track
    index?: number
    isActive?: boolean
    isPlaying?: boolean
    showSource?: boolean
    onPlay: (track: Track) => void
}

function TrackRow({
    track,
    index,
    isActive = false,
    isPlaying = false,
    showSource = true,
    onPlay,
}: TrackRowProps) {
    const { openArtist, openAlbum } = useMusicNavigation()
    const artists =
        track.artists && track.artists.length > 0
            ? track.artists
            : [{ id: "", name: track.artist || "未知艺人" }]

    function handleRowKey(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onPlay(track)
        }
    }

    function handleMetaClick(
        event: MouseEvent,
        action: () => void,
    ) {
        event.preventDefault()
        event.stopPropagation()
        action()
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onPlay(track)}
            onKeyDown={handleRowKey}
            className={cn(
                "group grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-150",
                "active:scale-[0.995] outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                isActive
                    ? "bg-black/[0.05] dark:bg-white/[0.08]"
                    : "hover:bg-black/[0.035] dark:hover:bg-white/[0.05]",
            )}
        >
            <div className="relative">
                <Cover src={track.coverUrl} alt={track.title} size="sm" />
                <span
                    className={cn(
                        "pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 text-white opacity-0 transition-opacity duration-150",
                        "group-hover:opacity-100 group-focus-visible:opacity-100",
                        isActive && "opacity-100",
                    )}
                >
                    {isPlaying ? (
                        <Pause className="size-3.5 fill-current" />
                    ) : (
                        <Play className="size-3.5 fill-current" />
                    )}
                </span>
            </div>

            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    {typeof index === "number" ? (
                        <span className="w-5 shrink-0 text-[12px] tabular-nums text-muted-foreground">
                            {index + 1}
                        </span>
                    ) : null}
                    <p
                        className={cn(
                            "truncate text-[13px] font-medium tracking-[-0.01em]",
                            isActive ? "text-primary" : "text-foreground",
                        )}
                    >
                        {track.title}
                    </p>
                    {showSource ? <SourceBadge source={track.source} /> : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {artists.map((artist, i) => (
                        <span key={`${artist.id || artist.name}-${i}`}>
                            {i > 0 ? (
                                <span className="text-muted-foreground/50"> / </span>
                            ) : null}
                            {artist.id && track.source === "netease" ? (
                                <button
                                    type="button"
                                    onClick={(event) =>
                                        handleMetaClick(event, () =>
                                            openArtist(artist.id),
                                        )
                                    }
                                    className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                                >
                                    {artist.name}
                                </button>
                            ) : (
                                <span>{artist.name}</span>
                            )}
                        </span>
                    ))}
                    <span className="mx-1.5 text-muted-foreground/50">·</span>
                    {track.albumId && track.source === "netease" ? (
                        <button
                            type="button"
                            onClick={(event) =>
                                handleMetaClick(event, () =>
                                    openAlbum(track.albumId!),
                                )
                            }
                            className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
                        >
                            {track.album}
                        </button>
                    ) : (
                        <span>{track.album}</span>
                    )}
                </p>
            </div>

            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                {formatDuration(track.durationMs)}
            </span>
        </div>
    )
}

export { TrackRow }