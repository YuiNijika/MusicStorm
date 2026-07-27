import { Search as SearchIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { SearchResultsSkeleton } from "@/components/music/loading-skeletons"
import { MediaCard } from "@/components/music/media-card"
import { CardsRail, RailControls, useRailApi } from "@/components/music/media-rail"
import { Section } from "@/components/music/section"
import { StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { usePlayer } from "@/hooks/use-player"
import { listLocalPlayableTracks } from "@/lib/local/library-store"
import {
    searchNeteaseAll,
    type NeteaseSearchBundle,
} from "@/lib/netease/search"
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type SearchMode = "local" | "netease"

const EMPTY_BUNDLE: NeteaseSearchBundle = {
    tracks: [],
    artists: [],
    albums: [],
    playlists: [],
    radios: [],
}

function SearchPage() {
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { openArtist, openAlbum, openPlaylist, openRadio } =
        useMusicNavigation()

    const [query, setQuery] = useState("")
    /** 网易云仅在点击搜索 / 回车后生效 */
    const [submittedQuery, setSubmittedQuery] = useState("")
    const [mode, setMode] = useState<SearchMode>("netease")
    const [remote, setRemote] = useState<NeteaseSearchBundle>(EMPTY_BUNDLE)
    const [isLoading, setIsLoading] = useState(false)
    const [errorText, setErrorText] = useState<string | null>(null)

    const artistRail = useRailApi()
    const albumRail = useRailApi()
    const playlistRail = useRailApi()
    const radioRail = useRailApi()

    const localCatalog = useMemo(() => listLocalPlayableTracks(), [])

    // 本地：输入即过滤
    const localResults = useMemo(() => {
        const keyword = query.trim().toLowerCase()
        if (!keyword) {
            return localCatalog
        }
        return localCatalog.filter((track) => {
            const haystack =
                `${track.title} ${track.artist} ${track.album}`.toLowerCase()
            return haystack.includes(keyword)
        })
    }, [localCatalog, query])

    const localArtists = useMemo(() => {
        const keyword = query.trim().toLowerCase()
        const map = new Map<string, { name: string; coverUrl: string; count: number }>()
        for (const track of localCatalog) {
            const name = track.artist?.trim() || "未知艺人"
            if (keyword && !name.toLowerCase().includes(keyword)) {
                continue
            }
            const prev = map.get(name)
            if (prev) {
                prev.count += 1
                if (!prev.coverUrl && track.coverUrl) {
                    prev.coverUrl = track.coverUrl
                }
            } else {
                map.set(name, {
                    name,
                    coverUrl: track.coverUrl || "",
                    count: 1,
                })
            }
        }
        return [...map.values()].slice(0, 16)
    }, [localCatalog, query])

    const localAlbums = useMemo(() => {
        const keyword = query.trim().toLowerCase()
        const map = new Map<
            string,
            { title: string; artist: string; coverUrl: string; count: number }
        >()
        for (const track of localCatalog) {
            const title = track.album?.trim() || "未知专辑"
            const key = `${title}::${track.artist}`
            if (
                keyword &&
                !title.toLowerCase().includes(keyword) &&
                !track.artist.toLowerCase().includes(keyword)
            ) {
                continue
            }
            const prev = map.get(key)
            if (prev) {
                prev.count += 1
                if (!prev.coverUrl && track.coverUrl) {
                    prev.coverUrl = track.coverUrl
                }
            } else {
                map.set(key, {
                    title,
                    artist: track.artist,
                    coverUrl: track.coverUrl || "",
                    count: 1,
                })
            }
        }
        return [...map.values()].slice(0, 16)
    }, [localCatalog, query])

    useEffect(() => {
        if (mode !== "netease") {
            setRemote(EMPTY_BUNDLE)
            setErrorText(null)
            setIsLoading(false)
            return
        }

        const keyword = submittedQuery.trim()
        if (!keyword) {
            setRemote(EMPTY_BUNDLE)
            setErrorText(null)
            setIsLoading(false)
            return
        }

        let cancelled = false
        setIsLoading(true)
        setErrorText(null)

        void searchNeteaseAll(keyword)
            .then((bundle: NeteaseSearchBundle) => {
                if (cancelled) {
                    return
                }
                setRemote(bundle)
                setIsLoading(false)
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return
                }
                setRemote(EMPTY_BUNDLE)
                setIsLoading(false)
                const message =
                    error instanceof Error
                        ? error.message
                        : "无法连接网易云接口，请确认服务已启动"
                setErrorText(message)
                notifyError("搜索失败", { description: message })
            })

        return () => {
            cancelled = true
        }
    }, [mode, submittedQuery])

    function runSearch() {
        const keyword = query.trim()
        if (mode === "netease") {
            setSubmittedQuery(keyword)
            return
        }

        // 本地：即时过滤已生效；按钮/回车给出一次明确反馈
        if (!keyword) {
            notifyInfo("输入关键词筛选本地", {
                description: `资料库共 ${localCatalog.length} 首`,
            })
            return
        }
        const songCount = localResults.length
        const artistCount = localArtists.length
        const albumCount = localAlbums.length
        if (songCount === 0 && artistCount === 0 && albumCount === 0) {
            notifyInfo("没有匹配的内容", { description: `关键词「${keyword}」` })
            return
        }
        notifySuccess("已筛选本地", {
            description: `歌曲 ${songCount} · 艺人 ${artistCount} · 专辑 ${albumCount}`,
        })
    }

    function handleModeChange(next: SearchMode) {
        setMode(next)
        setErrorText(null)
        if (next === "local") {
            setSubmittedQuery("")
            setRemote(EMPTY_BUNDLE)
        }
    }

    const remoteKeyword = submittedQuery.trim()
    const hasRemoteAny =
        remote.tracks.length > 0 ||
        remote.artists.length > 0 ||
        remote.albums.length > 0 ||
        remote.playlists.length > 0 ||
        remote.radios.length > 0

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <ModeChip
                        active={mode === "netease"}
                        label="网易云"
                        onClick={() => handleModeChange("netease")}
                    />
                    <ModeChip
                        active={mode === "local"}
                        label="本地"
                        onClick={() => handleModeChange("local")}
                    />
                </div>

                <div className="flex gap-2">
                    <label className="material-field flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
                        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.currentTarget.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault()
                                    runSearch()
                                }
                            }}
                            placeholder={
                                mode === "netease"
                                    ? "歌曲、艺人、专辑、歌单、播客"
                                    : "歌曲、艺人、专辑"
                            }
                            className="h-full w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={runSearch}
                        disabled={
                            mode === "netease"
                                ? !query.trim() || isLoading
                                : false
                        }
                        className={cn(
                            "h-11 shrink-0 cursor-pointer rounded-2xl bg-foreground px-4 text-[13px] font-medium text-background",
                            "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                        )}
                    >
                        {mode === "netease" && isLoading ? "搜索中…" : "搜索"}
                    </button>
                </div>
            </div>

            {mode === "netease" ? (
                isLoading ? (
                    <SearchResultsSkeleton />
                ) : errorText ? (
                    <StateHero
                        variant="error"
                        title="搜索失败"
                        description={errorText}
                    />
                ) : !remoteKeyword ? (
                    <StateHero
                        variant="search"
                        title="开始搜索"
                        description="输入关键词后点搜索或回车"
                    />
                ) : !hasRemoteAny ? (
                    <StateHero
                        variant="search"
                        title="没有匹配的内容"
                        description="试试其他关键词"
                    />
                ) : (
                    <div className="space-y-8">
                        {remote.tracks.length > 0 ? (
                            <Section
                                title="歌曲"
                                description={`${remote.tracks.length} 首`}
                                variant="listen"
                            >
                                <div className="space-y-0.5 rounded-[22px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
                                    {remote.tracks.map((track, index) => (
                                        <TrackRow
                                            key={`${track.source}-${track.id}`}
                                            track={track}
                                            index={index}
                                            isActive={currentTrack?.id === track.id}
                                            isPlaying={
                                                currentTrack?.id === track.id &&
                                                isPlaying
                                            }
                                            onPlay={(item) =>
                                                playOrToggle(item, remote.tracks)
                                            }
                                        />
                                    ))}
                                </div>
                            </Section>
                        ) : null}

                        {remote.artists.length > 0 ? (
                            <Section
                                title="艺人"
                                description={`${remote.artists.length}`}
                                variant="listen"
                                action={<RailControls api={artistRail.api} />}
                            >
                                <CardsRail setApi={artistRail.setApi}>
                                    {remote.artists.map((artist) => (
                                        <MediaCard
                                            key={artist.id}
                                            coverUrl={artist.coverUrl}
                                            title={artist.name}
                                            subtitle={
                                                artist.albumSize != null
                                                    ? `${artist.albumSize} 张专辑`
                                                    : "艺人"
                                            }
                                            onClick={() => openArtist(artist.id)}
                                            widthClassName="w-full"
                                        />
                                    ))}
                                </CardsRail>
                            </Section>
                        ) : null}

                        {remote.albums.length > 0 ? (
                            <Section
                                title="专辑"
                                description={`${remote.albums.length}`}
                                variant="listen"
                                action={<RailControls api={albumRail.api} />}
                            >
                                <CardsRail setApi={albumRail.setApi}>
                                    {remote.albums.map((album) => (
                                        <MediaCard
                                            key={album.id}
                                            coverUrl={album.coverUrl}
                                            title={album.title}
                                            subtitle={album.artistName}
                                            onClick={() => openAlbum(album.id)}
                                            widthClassName="w-full"
                                        />
                                    ))}
                                </CardsRail>
                            </Section>
                        ) : null}

                        {remote.playlists.length > 0 ? (
                            <Section
                                title="歌单"
                                description={`${remote.playlists.length}`}
                                variant="listen"
                                action={<RailControls api={playlistRail.api} />}
                            >
                                <CardsRail setApi={playlistRail.setApi}>
                                    {remote.playlists.map((playlist) => (
                                        <MediaCard
                                            key={playlist.id}
                                            coverUrl={playlist.coverUrl}
                                            title={playlist.title}
                                            subtitle={
                                                playlist.trackCount != null
                                                    ? `${playlist.trackCount} 首`
                                                    : playlist.creatorName || "歌单"
                                            }
                                            onClick={() => openPlaylist(playlist.id)}
                                            widthClassName="w-full"
                                        />
                                    ))}
                                </CardsRail>
                            </Section>
                        ) : null}

                        {remote.radios.length > 0 ? (
                            <Section
                                title="播客"
                                description={`${remote.radios.length}`}
                                variant="listen"
                                action={<RailControls api={radioRail.api} />}
                            >
                                <CardsRail setApi={radioRail.setApi}>
                                    {remote.radios.map((radio) => (
                                        <MediaCard
                                            key={radio.id}
                                            coverUrl={radio.coverUrl}
                                            title={radio.title}
                                            subtitle={
                                                radio.djName ||
                                                radio.category ||
                                                "播客"
                                            }
                                            onClick={() => openRadio(radio.id)}
                                            widthClassName="w-full"
                                        />
                                    ))}
                                </CardsRail>
                            </Section>
                        ) : null}
                    </div>
                )
            ) : localCatalog.length === 0 ? (
                <StateHero
                    variant="empty"
                    title="尚未导入本地音乐"
                    description="请先在「本地」页导入文件夹"
                />
            ) : !query.trim() ? (
                <Section
                    title="本地曲库"
                    description={`${localCatalog.length} 首已导入`}
                    variant="listen"
                >
                    <TrackList
                        tracks={localCatalog}
                        currentTrack={currentTrack}
                        isPlaying={isPlaying}
                        onPlay={(item, list) => playOrToggle(item, list)}
                    />
                </Section>
            ) : localResults.length === 0 &&
              localArtists.length === 0 &&
              localAlbums.length === 0 ? (
                <StateHero
                    variant="search"
                    title="没有匹配的内容"
                    description="试试其他关键词"
                />
            ) : (
                <div className="space-y-8">
                    {localResults.length > 0 ? (
                        <Section
                            title="歌曲"
                            description={`${localResults.length} 条匹配`}
                            variant="listen"
                        >
                            <TrackList
                                tracks={localResults}
                                currentTrack={currentTrack}
                                isPlaying={isPlaying}
                                onPlay={(item, list) => playOrToggle(item, list)}
                            />
                        </Section>
                    ) : null}

                    {localArtists.length > 0 ? (
                        <Section
                            title="艺人"
                            description={`${localArtists.length}`}
                            variant="listen"
                        >
                            <CardsRail>
                                {localArtists.map((artist) => (
                                    <MediaCard
                                        key={artist.name}
                                        coverUrl={artist.coverUrl}
                                        title={artist.name}
                                        subtitle={`${artist.count} 首`}
                                        widthClassName="w-full"
                                    />
                                ))}
                            </CardsRail>
                        </Section>
                    ) : null}

                    {localAlbums.length > 0 ? (
                        <Section
                            title="专辑"
                            description={`${localAlbums.length}`}
                            variant="listen"
                        >
                            <CardsRail>
                                {localAlbums.map((album) => (
                                    <MediaCard
                                        key={`${album.title}-${album.artist}`}
                                        coverUrl={album.coverUrl}
                                        title={album.title}
                                        subtitle={`${album.artist} · ${album.count} 首`}
                                        widthClassName="w-full"
                                    />
                                ))}
                            </CardsRail>
                        </Section>
                    ) : null}
                </div>
            )}
        </div>
    )
}

function TrackList({
    tracks,
    currentTrack,
    isPlaying,
    onPlay,
}: {
    tracks: Track[]
    currentTrack: Track | null | undefined
    isPlaying: boolean
    onPlay: (item: Track, list: Track[]) => void
}) {
    return (
        <div className="space-y-0.5 rounded-[22px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
            {tracks.map((track, index) => (
                <TrackRow
                    key={`${track.source}-${track.id}`}
                    track={track}
                    index={index}
                    isActive={currentTrack?.id === track.id}
                    isPlaying={currentTrack?.id === track.id && isPlaying}
                    onPlay={(item) => onPlay(item, tracks)}
                />
            ))}
        </div>
    )
}

function ModeChip({
    label,
    active,
    onClick,
}: {
    label: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-100 active:scale-[0.97]",
                active
                    ? "bg-foreground text-background"
                    : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
            )}
        >
            {label}
        </button>
    )
}

export { SearchPage }