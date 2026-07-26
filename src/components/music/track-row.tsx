import { Heart, MoreHorizontal, Pause, Play } from "lucide-react"
import {
    useEffect,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from "react"

import { Cover } from "@/components/music/cover"
import { SourceBadge } from "@/components/music/source-badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLiked } from "@/hooks/use-liked"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { formatDuration } from "@/lib/format"
import { pickImageAsDataUrl } from "@/lib/local/cover"
import {
    LYRIC_OVERRIDE_EVENT,
    clearLyricOverride,
    getLyricOverride,
} from "@/lib/lyric/overrides"
import {
    COVER_OVERRIDE_EVENT,
    clearCoverOverride,
    getCoverOverride,
    resolveTrackCoverUrl,
    setCoverOverride,
} from "@/lib/music/cover-overrides"
import {
    downloadNeteaseTrack,
    overrideTrackLyric,
    removeTracksFromPlaylist,
} from "@/lib/netease/track-actions"
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type TrackRowProps = {
    track: Track
    index?: number
    /** 拖拽手柄等前缀 */
    leading?: ReactNode
    isActive?: boolean
    isPlaying?: boolean
    showSource?: boolean
    /** 独立专辑列，默认 netease 开 */
    showAlbumColumn?: boolean
    /**
     * 是否展示专辑名。
     * 首页三栏等窄布局应 false。
     */
    showAlbumMeta?: boolean
    /** 喜欢与更多菜单，默认 netease 开，local 为元数据菜单 */
    showActions?: boolean
    /** 更紧凑的 padding 与字号，首页三栏 */
    dense?: boolean
    /** 传入时可从歌单移除 */
    playlistId?: string
    onRemoved?: (trackId: string) => void
    onPlay: (track: Track) => void
}

function TrackRow({
    track,
    index,
    leading,
    isActive = false,
    isPlaying = false,
    showSource = true,
    showAlbumColumn,
    showAlbumMeta = true,
    showActions,
    dense = false,
    playlistId,
    onRemoved,
    onPlay,
}: TrackRowProps) {
    const { openArtist, openAlbum } = useMusicNavigation()
    const { loggedIn } = useNeteaseSession()
    const { isTrackLiked, toggleTrackLiked } = useLiked()
    const [, setOverrideTick] = useState(0)

    const isNetease = track.source === "netease"
    const isLocal = track.source === "local"
    const albumCol = showAlbumMeta && (showAlbumColumn ?? isNetease)
    const inlineAlbum = showAlbumMeta && !albumCol
    const actions = showActions ?? (isNetease || isLocal)
    const liked = isNetease && isTrackLiked(track.id)
    const coverUrl = resolveTrackCoverUrl(track.id, track.coverUrl)
    const hasLyricOverride = Boolean(getLyricOverride(track.id))
    const hasCoverOverride = Boolean(getCoverOverride(track.id))

    useEffect(() => {
        function bump() {
            setOverrideTick((n) => n + 1)
        }
        window.addEventListener(COVER_OVERRIDE_EVENT, bump)
        window.addEventListener(LYRIC_OVERRIDE_EVENT, bump)
        return () => {
            window.removeEventListener(COVER_OVERRIDE_EVENT, bump)
            window.removeEventListener(LYRIC_OVERRIDE_EVENT, bump)
        }
    }, [])

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

    function handleMetaClick(event: MouseEvent, action: () => void) {
        event.preventDefault()
        event.stopPropagation()
        action()
    }

    async function handleLike(event: MouseEvent) {
        event.preventDefault()
        event.stopPropagation()
        if (!loggedIn) {
            notifyInfo("请先登录网易云", { description: "侧栏或设置中登录后可红心" })
            return
        }
        try {
            await toggleTrackLiked(track.id)
        } catch {
            // store 已 toast
        }
    }

    async function handleRemove() {
        if (!playlistId) {
            return
        }
        try {
            await removeTracksFromPlaylist(playlistId, [track.id])
            onRemoved?.(track.id)
            notifySuccess("已从歌单移除", { description: track.title })
        } catch (error) {
            notifyError("移除失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
        }
    }

    async function handleDownload() {
        try {
            await downloadNeteaseTrack(track)
        } catch (error) {
            notifyError("下载失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
        }
    }

    async function handleOverrideLyric() {
        try {
            await overrideTrackLyric(track)
        } catch (error) {
            notifyError("覆盖歌词失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
        }
    }

    function handleClearLyric() {
        clearLyricOverride(track.id)
        notifySuccess("已清除自定义歌词", { description: track.title })
    }

    async function handleOverrideCover() {
        try {
            const dataUrl = await pickImageAsDataUrl()
            if (!dataUrl) {
                notifyInfo("已取消")
                return
            }
            setCoverOverride(track.id, dataUrl)
            notifySuccess("已更换封面", { description: track.title })
        } catch (error) {
            notifyError("更换封面失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
        }
    }

    function handleClearCover() {
        clearCoverOverride(track.id)
        notifySuccess("已清除自定义封面", { description: track.title })
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onPlay(track)}
            onKeyDown={handleRowKey}
            className={cn(
                "group grid w-full min-w-0 cursor-pointer items-center text-left transition-colors duration-150",
                dense
                    ? "gap-1.5 rounded-xl px-1.5 py-1.5 sm:gap-2"
                    : "gap-2 rounded-2xl px-2.5 py-2 sm:gap-3 sm:px-3",
                leading
                    ? albumCol && actions
                        ? "grid-cols-[auto_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]"
                        : albumCol
                          ? "grid-cols-[auto_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                          : actions
                            ? "grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto]"
                            : "grid-cols-[auto_auto_minmax(0,1fr)_auto]"
                    : albumCol && actions
                      ? "grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]"
                      : albumCol
                        ? "grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                        : actions
                          ? "grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
                          : "grid-cols-[auto_minmax(0,1fr)_auto]",
                "active:scale-[0.995] outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                isActive
                    ? "bg-black/[0.05] dark:bg-white/[0.08]"
                    : "hover:bg-black/[0.035] dark:hover:bg-white/[0.05]",
            )}
        >
            {leading ? (
                <div
                    className="shrink-0"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                >
                    {leading}
                </div>
            ) : null}

            <div className={cn("relative shrink-0", dense && "scale-90 origin-left")}>
                <Cover src={coverUrl} alt={track.title} size="sm" />
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

            <div className="min-w-0 overflow-hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                    {typeof index === "number" ? (
                        <span className="w-5 shrink-0 text-[12px] tabular-nums text-muted-foreground">
                            {index + 1}
                        </span>
                    ) : null}
                    <p
                        className={cn(
                            "min-w-0 flex-1 truncate font-medium tracking-[-0.01em]",
                            dense ? "text-[12px]" : "text-[13px]",
                            isActive ? "text-primary" : "text-foreground",
                        )}
                    >
                        {track.title}
                    </p>
                    {showSource ? (
                        <span className="shrink-0">
                            <SourceBadge source={track.source} />
                        </span>
                    ) : null}
                </div>
                <p
                    className={cn(
                        "mt-0.5 truncate text-muted-foreground",
                        dense ? "text-[11px]" : "text-[12px]",
                    )}
                >
                    {artists.map((artist, i) => (
                        <span key={`${artist.id || artist.name}-${i}`}>
                            {i > 0 ? (
                                <span className="text-muted-foreground/50"> / </span>
                            ) : null}
                            {artist.id && isNetease ? (
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
                    {inlineAlbum && track.album ? (
                        <>
                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                            {track.albumId && isNetease ? (
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
                        </>
                    ) : null}
                </p>
            </div>

            {albumCol ? (
                <div className="hidden min-w-0 sm:block">
                    {track.albumId && isNetease ? (
                        <button
                            type="button"
                            onClick={(event) =>
                                handleMetaClick(event, () => openAlbum(track.albumId!))
                            }
                            className="truncate text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                            {track.album || "未知专辑"}
                        </button>
                    ) : (
                        <span className="truncate text-[12px] text-muted-foreground">
                            {track.album || "未知专辑"}
                        </span>
                    )}
                </div>
            ) : null}

            {actions && isNetease ? (
                <button
                    type="button"
                    title={liked ? "取消喜欢" : "喜欢"}
                    onClick={(event) => void handleLike(event)}
                    className={cn(
                        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full",
                        "text-muted-foreground opacity-70 transition-opacity hover:opacity-100",
                        "group-hover:opacity-100",
                        liked && "text-rose-500 opacity-100",
                    )}
                >
                    <Heart
                        className={cn("size-3.5", liked && "fill-current")}
                    />
                </button>
            ) : actions && isLocal ? (
                <span className="size-8 shrink-0" aria-hidden />
            ) : null}

            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                {formatDuration(track.durationMs)}
            </span>

            {actions ? (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        onClick={(event) => event.stopPropagation()}
                        className={cn(
                            "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full",
                            "text-muted-foreground opacity-60 hover:bg-black/[0.05] hover:opacity-100",
                            "group-hover:opacity-100 dark:hover:bg-white/[0.08]",
                        )}
                        aria-label="更多操作"
                    >
                        <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        sideOffset={6}
                        className="min-w-[10.5rem]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {playlistId ? (
                            <>
                                <DropdownMenuItem
                                    onClick={() => void handleRemove()}
                                >
                                    从歌单移除
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        ) : null}
                        {isNetease ? (
                            <DropdownMenuItem onClick={() => void handleDownload()}>
                                下载歌曲
                            </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                            onClick={() => void handleOverrideLyric()}
                        >
                            {isLocal ? "更换歌词" : "覆盖歌词"}
                        </DropdownMenuItem>
                        {hasLyricOverride ? (
                            <DropdownMenuItem onClick={handleClearLyric}>
                                清除自定义歌词
                            </DropdownMenuItem>
                        ) : null}
                        {isLocal ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => void handleOverrideCover()}
                                >
                                    更换封面
                                </DropdownMenuItem>
                                {hasCoverOverride ? (
                                    <DropdownMenuItem onClick={handleClearCover}>
                                        清除自定义封面
                                    </DropdownMenuItem>
                                ) : null}
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </div>
    )
}

export { TrackRow }