import {
    FilePlus2,
    FolderOpen,
    Loader2,
    MicVocal,
    Plus,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import {
    LocalAlbumDrawer,
    type LocalAlbumDrawerMode,
} from "@/components/music/local-album-drawer"
import { LocalAlbumMenu, LocalArtistMenu } from "@/components/music/local-album-menu"
import { LocalArtistDrawer } from "@/components/music/local-artist-drawer"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePlayer } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import type {
    AlbumDraft,
    LocalAlbum,
    LocalArtist,
} from "@/lib/local/library-store"
import {
    authorizeWebTrack,
    clearWebLibrary,
    estimateWebStorage,
    loadWebLibrary,
    removeWebTrack,
    saveWebTracks,
} from "@/lib/local/web-library"
import {
    revokeWebTrack,
    webImportAudioFiles,
    webImportDirectory,
    type WebLocalTrack,
} from "@/lib/local/web-import"
import {
    createAlbum,
    createArtist,
    groupImportedTracks,
    listAlbumsByArtist,
    loadMeta,
    removeAlbum,
    removeArtist,
    resolveAlbumCover,
    resolveArtistCover,
    saveMeta,
    updateAlbum,
    updateArtist,
    type WebLibraryState,
} from "@/lib/local/web-library-store"
import { notifySuccess, notifyWarning } from "@/lib/notify"
import { cn } from "@/lib/utils"

// 网页版本地音乐页：艺人/专辑分组 + 曲目，UI 对齐桌面版资料库

type WebNav =
    | { kind: "root" }
    | { kind: "artist"; artistId: string }
    | { kind: "album"; albumId: string }
    | { kind: "all" }

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const EMPTY_STATE: WebLibraryState = { artists: [], albums: [], tracks: [] }

const GRID_CLASS =
    "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"

function LocalWebPage() {
    const { currentTrack, isPlaying, playOrToggle } = usePlayer()
    const [state, setState] = useState<WebLibraryState>(EMPTY_STATE)
    const [nav, setNav] = useState<WebNav>({ kind: "root" })
    const [restoring, setRestoring] = useState(true)
    const [importing, setImporting] = useState(false)
    const [storageLabel, setStorageLabel] = useState("")

    // 艺人抽屉
    const [artistDrawerOpen, setArtistDrawerOpen] = useState(false)
    const [artistEditId, setArtistEditId] = useState<string | null>(null)
    const [artistInitial, setArtistInitial] = useState({ name: "", coverDataUrl: "" })
    // 专辑抽屉
    const [albumDrawerOpen, setAlbumDrawerOpen] = useState(false)
    const [albumMode, setAlbumMode] = useState<LocalAlbumDrawerMode>("create")
    const [albumEditId, setAlbumEditId] = useState<string | null>(null)
    const [albumInitial, setAlbumInitial] = useState<AlbumDraft>({
        title: "",
        artist: "",
        coverDataUrl: "",
        folderPath: null,
        artistId: null,
    })

    // 刷新后恢复：曲目从 IndexedDB，艺人/专辑从 localStorage
    useEffect(() => {
        let cancelled = false
        const meta = loadMeta()
        void loadWebLibrary()
            .then((tracks) => {
                if (!cancelled) {
                    setState({ artists: meta.artists, albums: meta.albums, tracks })
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setState({ artists: meta.artists, albums: meta.albums, tracks: [] })
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setRestoring(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        void estimateWebStorage().then((info) => {
            if (cancelled || !info) {
                return
            }
            setStorageLabel(` · 已占用 ${formatBytes(info.usage)}`)
        })
        return () => {
            cancelled = true
        }
    }, [state.tracks.length])

    const persistMeta = useCallback((next: WebLibraryState) => {
        saveMeta({ artists: next.artists, albums: next.albums })
    }, [])

    // —— 导入 ——

    const importDirectory = useCallback(async () => {
        setImporting(true)
        try {
            const list = await webImportDirectory()
            if (list.length === 0) {
                return
            }
            const next = groupImportedTracks(state, list)
            setState(next)
            persistMeta(next)
            const importedIds = new Set(list.map((item) => item.id))
            await saveWebTracks(next.tracks.filter((item) => importedIds.has(item.id)))
            notifySuccess("导入完成", { description: `已导入 ${list.length} 首` })
        } catch (error) {
            console.warn("[web-local] import directory failed", error)
        } finally {
            setImporting(false)
        }
    }, [state, persistMeta])

    const importFiles = useCallback(async () => {
        setImporting(true)
        try {
            const list = await webImportAudioFiles()
            if (list.length === 0) {
                return
            }
            const next = groupImportedTracks(state, list)
            setState(next)
            persistMeta(next)
            const importedIds = new Set(list.map((item) => item.id))
            try {
                await saveWebTracks(
                    next.tracks.filter((item) => importedIds.has(item.id)),
                )
            } catch {
                notifyWarning("存储空间不足", {
                    description: "本次导入仅在内存中播放，刷新后需重新导入",
                    id: "web-library-quota",
                })
            }
            notifySuccess("导入完成", { description: `已导入 ${list.length} 首` })
        } catch (error) {
            console.warn("[web-local] import files failed", error)
        } finally {
            setImporting(false)
        }
    }, [state, persistMeta])

    // —— 艺人操作 ——

    const openCreateArtist = useCallback(() => {
        setArtistEditId(null)
        setArtistInitial({ name: "", coverDataUrl: "" })
        setArtistDrawerOpen(true)
    }, [])

    const openEditArtist = useCallback((artist: LocalArtist) => {
        setArtistEditId(artist.id)
        setArtistInitial({ name: artist.name, coverDataUrl: artist.coverDataUrl })
        setArtistDrawerOpen(true)
    }, [])

    const submitArtist = useCallback(
        (draft: { name: string; coverDataUrl: string }) => {
            const next = artistEditId
                ? updateArtist(state, artistEditId, draft)
                : createArtist(state, draft).state
            setState(next)
            persistMeta(next)
            setArtistDrawerOpen(false)
            if (artistEditId) {
                notifySuccess("艺人已更新", { description: draft.name })
            } else {
                notifySuccess("艺人已创建", { description: draft.name })
            }
        },
        [artistEditId, state, persistMeta],
    )

    const confirmRemoveArtist = useCallback(
        (artist: LocalArtist) => {
            if (!window.confirm(`移除艺人分组「${artist.name}」？`)) {
                return
            }
            const albumCount = listAlbumsByArtist(state, artist.id).length
            const includeAlbums =
                albumCount > 0
                    ? window.confirm(
                          `同时移除其下 ${albumCount} 张专辑？\n「确定」= 连同专辑移除，「取消」= 专辑保留`,
                      )
                    : false
            const prevTracks = state.tracks
            const next = removeArtist(state, artist.id, includeAlbums)
            setState(next)
            persistMeta(next)
            const changed = next.tracks.filter(
                (track) =>
                    track.localAlbumId == null &&
                    prevTracks.some(
                        (prev) => prev.id === track.id && prev.localAlbumId != null,
                    ),
            )
            if (changed.length > 0) {
                void saveWebTracks(changed)
            }
            if (nav.kind === "artist" && nav.artistId === artist.id) {
                setNav({ kind: "root" })
            }
            notifySuccess("已移除艺人", { description: artist.name })
        },
        [state, nav, persistMeta],
    )

    // —— 专辑操作 ——

    const openCreateAlbum = useCallback(() => {
        setAlbumMode("create")
        setAlbumEditId(null)
        setAlbumInitial({
            title: "",
            artist: "",
            coverDataUrl: "",
            folderPath: null,
            artistId: null,
        })
        setAlbumDrawerOpen(true)
    }, [])

    const openEditAlbum = useCallback((album: LocalAlbum) => {
        setAlbumMode("edit")
        setAlbumEditId(album.id)
        setAlbumInitial({
            title: album.title,
            artist: album.artist,
            coverDataUrl: album.coverDataUrl,
            folderPath: album.folderPath,
            artistId: album.artistId,
        })
        setAlbumDrawerOpen(true)
    }, [])

    const submitAlbum = useCallback(
        (draft: AlbumDraft) => {
            const next = albumEditId
                ? updateAlbum(state, albumEditId, draft)
                : createAlbum(state, draft).state
            setState(next)
            persistMeta(next)
            setAlbumDrawerOpen(false)
            if (albumEditId) {
                notifySuccess("专辑已更新", { description: draft.title })
            } else {
                notifySuccess("专辑已创建", { description: draft.title })
            }
        },
        [albumEditId, state, persistMeta],
    )

    const confirmRemoveAlbum = useCallback(
        (album: LocalAlbum) => {
            if (!window.confirm(`移除专辑「${album.title}」？其下曲目将解除归属（文件保留）。`)) {
                return
            }
            const prevTracks = state.tracks
            const next = removeAlbum(state, album.id)
            setState(next)
            persistMeta(next)
            const changed = next.tracks.filter(
                (track) =>
                    track.localAlbumId == null &&
                    prevTracks.some(
                        (prev) => prev.id === track.id && prev.localAlbumId === album.id,
                    ),
            )
            if (changed.length > 0) {
                void saveWebTracks(changed)
            }
            if (nav.kind === "album" && nav.albumId === album.id) {
                setNav({ kind: "root" })
            }
            notifySuccess("已移除专辑", { description: album.title })
        },
        [state, nav, persistMeta],
    )

    // —— 清空 ——

    const confirmClear = useCallback(() => {
        if (!window.confirm("清空浏览器中保存的全部本地音乐与分组？")) {
            return
        }
        state.tracks.forEach(revokeWebTrack)
        setState(EMPTY_STATE)
        persistMeta(EMPTY_STATE)
        setNav({ kind: "root" })
        void clearWebLibrary().catch((error) =>
            console.warn("[web-local] clear IndexedDB failed", error),
        )
    }, [state.tracks, persistMeta])

    // —— 播放 ——

    const handlePlay = useCallback(
        async (track: WebLocalTrack, queue: WebLocalTrack[]) => {
            if (track.needsAuth) {
                try {
                    const authorized = await authorizeWebTrack(track)
                    setState((prev) => ({
                        ...prev,
                        tracks: prev.tracks.map((item) =>
                            item.id === track.id ? authorized : item,
                        ),
                    }))
                    playOrToggle(authorized, queue)
                } catch {
                    notifyWarning("需要授权访问文件夹", {
                        description: "点击播放时浏览器会弹出授权，允许后可继续",
                        id: `web-auth-${track.id}`,
                    })
                }
                return
            }
            playOrToggle(track, queue)
        },
        [playOrToggle],
    )

    const removeSingleTrack = useCallback((track: WebLocalTrack) => {
        setState((prev) => ({
            ...prev,
            tracks: prev.tracks.filter((item) => item.id !== track.id),
        }))
        revokeWebTrack(track)
        void removeWebTrack(track.id).catch((error) =>
            console.warn("[web-local] remove from IndexedDB failed", error),
        )
    }, [])

    // —— 派生 ——

    const sortedArtists = useMemo(
        () => [...state.artists].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
        [state.artists],
    )

    const rootAlbums = useMemo(
        () =>
            state.albums
                .filter((album) => album.artistId == null)
                .sort((a, b) => a.title.localeCompare(b.title, "zh-CN")),
        [state.albums],
    )

    const selectedArtist = useMemo(() => {
        if (nav.kind !== "artist") {
            return null
        }
        return state.artists.find((item) => item.id === nav.artistId) ?? null
    }, [nav, state.artists])

    const selectedAlbum = useMemo(() => {
        if (nav.kind !== "album") {
            return null
        }
        return state.albums.find((item) => item.id === nav.albumId) ?? null
    }, [nav, state.albums])

    const artistAlbums = useMemo(
        () =>
            nav.kind === "artist" ? listAlbumsByArtist(state, nav.artistId) : [],
        [nav, state],
    )

    const albumTracks = useMemo(() => {
        if (nav.kind !== "album") {
            return []
        }
        return state.tracks.filter((track) => track.localAlbumId === nav.albumId)
    }, [nav, state.tracks])

    const trackCount = useMemo(
        () => (album: LocalAlbum) =>
            state.tracks.filter((track) => track.localAlbumId === album.id).length,
        [state.tracks],
    )

    const subtitle = `${state.artists.length} 位艺人 · ${state.albums.length} 张专辑 · ${state.tracks.length} 首`

    // —— 视图渲染 ——

    if (restoring) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center dark:border-white/[0.16]">
                <p className="text-[14px] text-muted-foreground">
                    正在恢复上次导入的音乐…
                </p>
            </div>
        )
    }

    if (nav.kind === "artist" && selectedArtist) {
        const artist = selectedArtist
        const cover = resolveArtistCover(state, artist)
        return (
            <div className="space-y-6 pb-4">
                <BackButton onClick={() => setNav({ kind: "root" })} label="资料库" />

                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                        <Cover
                            src={cover}
                            alt={artist.name}
                            size="lg"
                            className="size-28 shrink-0 rounded-full shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.1] sm:size-36"
                        />
                        <div className="min-w-0 space-y-2 pb-1">
                            <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase sm:text-[12px]">
                                艺人 / 合集
                            </p>
                            <h1 className="text-[22px] leading-[1.15] font-semibold tracking-[-0.04em] sm:text-[28px] md:text-[32px]">
                                {artist.name}
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                {artistAlbums.length} 张专辑 ·{" "}
                                {state.tracks.filter((track) =>
                                    track.localAlbumId != null &&
                                    artistAlbums.some(
                                        (album) => album.id === track.localAlbumId,
                                    ),
                                ).length}{" "}
                                首
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => openEditArtist(artist)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            编辑
                        </button>
                        <button
                            type="button"
                            onClick={() => confirmRemoveArtist(artist)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            删除分组
                        </button>
                    </div>
                </header>

                {artistAlbums.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="该艺人暂无专辑"
                        description="导入音乐或新建专辑后自动归组"
                        icon={MicVocal}
                    />
                ) : (
                    <Section
                        title="专辑"
                        description={`${artistAlbums.length} 张 · 点开进入曲目`}
                    >
                        <div className={GRID_CLASS}>
                            {artistAlbums.map((album) => (
                                <div key={album.id} className="group relative">
                                    <MediaCard
                                        coverUrl={resolveAlbumCover(state, album)}
                                        title={album.title}
                                        subtitle={`${album.artist || "未知艺人"} · ${trackCount(album)} 首`}
                                        widthClassName="w-full"
                                        onClick={() =>
                                            setNav({ kind: "album", albumId: album.id })
                                        }
                                    />
                                    <div className="absolute top-2 right-2">
                                        <LocalAlbumMenu
                                            album={album}
                                            overlay
                                            onEdit={openEditAlbum}
                                            onRescan={() => {}}
                                            onDelete={confirmRemoveAlbum}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        )
    }

    if (nav.kind === "album" && selectedAlbum) {
        const album = selectedAlbum
        return (
            <div className="space-y-6 pb-4">
                <BackButton onClick={() => setNav({ kind: "root" })} label="资料库" />

                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                        <Cover
                            src={resolveAlbumCover(state, album)}
                            alt={album.title}
                            size="lg"
                            className="size-28 shrink-0 rounded-[16px] shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.1] sm:size-36"
                        />
                        <div className="min-w-0 space-y-2 pb-1">
                            <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase sm:text-[12px]">
                                专辑
                            </p>
                            <h1 className="text-[22px] leading-[1.15] font-semibold tracking-[-0.04em] sm:text-[28px] md:text-[32px]">
                                {album.title}
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                {album.artist || "未知艺人"} · {albumTracks.length} 首
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => openEditAlbum(album)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            编辑
                        </button>
                        <button
                            type="button"
                            onClick={() => confirmRemoveAlbum(album)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            删除专辑
                        </button>
                    </div>
                </header>

                {albumTracks.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="该专辑暂无曲目"
                        description="回到资料库选择文件夹或音频文件导入"
                        icon={FilePlus2}
                    />
                ) : (
                    <div className="apple-list-surface space-y-0.5 p-1.5">
                        {albumTracks.map((track) => (
                            <TrackRow
                                key={track.id}
                                track={track}
                                isActive={currentTrack?.id === track.id}
                                isPlaying={currentTrack?.id === track.id && isPlaying}
                                showSource={false}
                                showAlbumMeta={false}
                                dense
                                onPlay={(item) =>
                                    void handlePlay(item as WebLocalTrack, albumTracks)
                                }
                                trailing={
                                    track.needsAuth ? (
                                        <span className="text-[12px] text-muted-foreground">
                                            需授权
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-label={`移除 ${track.title}`}
                                            onClick={() => removeSingleTrack(track)}
                                            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] hover:text-foreground"
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                aria-hidden="true"
                                            >
                                                <path d="M6 6l12 12M18 6L6 18" />
                                            </svg>
                                        </button>
                                    )
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // 全部歌曲
    if (nav.kind === "all") {
        return (
            <div className="space-y-6 pb-4">
                <BackButton onClick={() => setNav({ kind: "root" })} label="资料库" />

                <PageTitle
                    title="全部歌曲"
                    subtitle={`${state.tracks.length} 首 · 共 ${formatDuration(
                        state.tracks.reduce((sum, track) => sum + track.durationMs, 0),
                    )}${storageLabel}`}
                    trailing={
                        <button
                            type="button"
                            onClick={confirmClear}
                            className="apple-control inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                        >
                            清空存储
                        </button>
                    }
                />

                {state.tracks.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="还没有本地音乐"
                        description="回到资料库导入文件夹或音频文件"
                        icon={FolderOpen}
                    />
                ) : (
                    <div className="apple-list-surface space-y-0.5 p-1.5">
                        {state.tracks.map((track) => (
                            <TrackRow
                                key={track.id}
                                track={track}
                                isActive={currentTrack?.id === track.id}
                                isPlaying={currentTrack?.id === track.id && isPlaying}
                                showSource={false}
                                showAlbumMeta={false}
                                dense
                                onPlay={(item) =>
                                    void handlePlay(item as WebLocalTrack, state.tracks)
                                }
                                trailing={
                                    track.needsAuth ? (
                                        <span className="text-[12px] text-muted-foreground">
                                            需授权
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-label={`移除 ${track.title}`}
                                            onClick={() => removeSingleTrack(track)}
                                            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] hover:text-foreground"
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                aria-hidden="true"
                                            >
                                                <path d="M6 6l12 12M18 6L6 18" />
                                            </svg>
                                        </button>
                                    )
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // 根视图
    const isEmpty =
        state.artists.length === 0 &&
        state.albums.length === 0 &&
        state.tracks.length === 0

    return (
        <div className="space-y-7 pb-4">
            <PageTitle
                title="资料库"
                subtitle={isEmpty ? "导入本机音乐，自动按艺人 / 专辑归组" : subtitle}
                trailing={
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            disabled={importing}
                            className={cn(
                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full",
                                "apple-primary-action px-3.5 text-[13px] font-semibold",
                                "transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
                            )}
                        >
                            {importing ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Plus className="size-3.5" strokeWidth={2.4} />
                            )}
                            {importing ? "解析中…" : "新建"}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={8} className="w-56 p-1.5">
                            <DropdownMenuItem
                                onClick={openCreateAlbum}
                                className="cursor-pointer"
                            >
                                <Plus className="size-4" strokeWidth={2.2} />
                                <span className="flex flex-col">
                                    <span>新建专辑</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                        空专辑，可手动导入音乐
                                    </span>
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={openCreateArtist}
                                className="cursor-pointer"
                            >
                                <MicVocal className="size-4" />
                                <span className="flex flex-col">
                                    <span>新建艺人</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                        手动创建艺人分组
                                    </span>
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={importing}
                                onClick={() => void importDirectory()}
                                className="cursor-pointer"
                            >
                                <FolderOpen className="size-4" />
                                <span className="flex flex-col">
                                    <span>导入文件夹</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                        子文件夹自动归为专辑
                                    </span>
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={importing}
                                onClick={() => void importFiles()}
                                className="cursor-pointer"
                            >
                                <FilePlus2 className="size-4" />
                                <span className="flex flex-col">
                                    <span>选择音频文件</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                        按标签自动归组
                                    </span>
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            />

            {isEmpty ? (
                <StateHero
                    variant="empty"
                    title="资料库是空的"
                    description="点右上角「新建」：新建专辑 · 新建艺人 · 导入文件夹 · 选择音频文件"
                    icon={FolderOpen}
                />
            ) : (
                <>
                    {sortedArtists.length > 0 ? (
                        <Section
                            title="艺人"
                            description={`${sortedArtists.length} 位 · 子专辑自动归组`}
                        >
                            <div className={GRID_CLASS}>
                                {sortedArtists.map((artist) => {
                                    const albums = listAlbumsByArtist(state, artist.id)
                                    return (
                                        <div key={artist.id} className="group relative">
                                            <MediaCard
                                                coverUrl={resolveArtistCover(state, artist)}
                                                title={artist.name}
                                                subtitle={`${albums.length} 张专辑`}
                                                widthClassName="w-full"
                                                onClick={() =>
                                                    setNav({
                                                        kind: "artist",
                                                        artistId: artist.id,
                                                    })
                                                }
                                            />
                                            <div className="absolute top-2 right-2">
                                                <LocalArtistMenu
                                                    artist={artist}
                                                    overlay
                                                    onEdit={openEditArtist}
                                                    onDelete={confirmRemoveArtist}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </Section>
                    ) : null}

                    <Section
                        title="专辑"
                        description={`${rootAlbums.length} 张 · 点开进入曲目`}
                        variant="listen"
                        action={
                            state.tracks.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setNav({ kind: "all" })}
                                    className="apple-control inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium"
                                >
                                    全部歌曲 · {state.tracks.length}
                                </button>
                            ) : undefined
                        }
                    >
                        {rootAlbums.length > 0 ? (
                            <div className={GRID_CLASS}>
                                {rootAlbums.map((album) => (
                                    <div key={album.id} className="group relative">
                                        <MediaCard
                                            coverUrl={resolveAlbumCover(state, album)}
                                            title={album.title}
                                            subtitle={`${album.artist || "未知艺人"} · ${trackCount(album)} 首`}
                                            widthClassName="w-full"
                                            onClick={() =>
                                                setNav({ kind: "album", albumId: album.id })
                                            }
                                        />
                                        <div className="absolute top-2 right-2">
                                            <LocalAlbumMenu
                                                album={album}
                                                overlay
                                                onEdit={openEditAlbum}
                                                onRescan={() => {}}
                                                onDelete={confirmRemoveAlbum}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <StateHero
                                variant="empty"
                                title="暂无专辑"
                                description="导入文件夹或新建专辑开始管理本地音乐"
                                icon={FolderOpen}
                            />
                        )}
                    </Section>
                </>
            )}

            <LocalArtistDrawer
                open={artistDrawerOpen}
                initial={artistInitial}
                onOpenChange={setArtistDrawerOpen}
                onSubmit={submitArtist}
            />

            <LocalAlbumDrawer
                open={albumDrawerOpen}
                mode={albumMode}
                initial={albumInitial}
                artists={state.artists}
                onOpenChange={setAlbumDrawerOpen}
                onSubmit={submitAlbum}
            />
        </div>
    )
}

export { LocalWebPage }
