import {
    Check,
    Disc3,
    FilePlus2,
    FolderOpen,
    Library,
    Loader2,
    MicVocal,
    MoreHorizontal,
    Pencil,
    Plus,
    Sparkles,
    SquareCheck,
    Trash2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { AddToPlaylistDialog } from "@/components/music/add-to-playlist-dialog"
import { Cover } from "@/components/music/cover"
import { DragList } from "@/components/music/drag-list"
import { LocalArtistDrawer } from "@/components/music/local-artist-drawer"
import {
    LocalAlbumDrawer,
    type LocalAlbumDrawerMode,
} from "@/components/music/local-album-drawer"
import { LocalAlbumMenu, LocalArtistMenu } from "@/components/music/local-album-menu"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
import { ViewModeToggle } from "@/components/music/view-mode-toggle"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLocalLibrary } from "@/hooks/use-local-library"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    setLocalAlbumSort,
    setLocalAlbumView,
    setTrackSort,
} from "@/lib/library/layout-prefs"
import {
    LOCAL_ALBUM_SORT_OPTIONS,
    sortLocalAlbums,
    sortTracks,
    TRACK_SORT_OPTIONS,
} from "@/lib/library/sort"
import {
    ORDER_EVENT,
    getLocalAlbumListOrder,
    getLocalOrderIds,
    setLocalAlbumListOrder,
    setLocalAlbumOrder,
    setLocalAllOrder,
} from "@/lib/library/track-order"
import type { AlbumDraft, LocalAlbum, LocalArtist } from "@/lib/local/library-store"
import { listTracksByAlbum, toThumbnailUrl } from "@/lib/local/library-store"
import {
    applyNeteaseMetadata,
    needsNeteaseMetadata,
} from "@/lib/local/netease-metadata"
import { getCoverOverride } from "@/lib/music/cover-overrides"
import { coverPathToUrl } from "@/lib/local/cover"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type ConfirmState =
    | { kind: "none" }
    | { kind: "clear" }
    | { kind: "remove"; album: LocalAlbum }
    | { kind: "remove-artist"; artist: LocalArtist; albumCount?: number }
    | { kind: "remove-artists"; artists: LocalArtist[]; albumCount?: number }
    | { kind: "remove-albums"; albums: LocalAlbum[] }

function LocalPage() {
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()
    const { trackSort, localAlbumSort, localAlbumView } = useLibraryLayout()
    const lib = useLocalLibrary()
    const [orderTick, setOrderTick] = useState(0)
    const [metadataBusy, setMetadataBusy] = useState(false)

    const orderScope =
        lib.nav.kind === "album" && lib.selectedAlbum
            ? lib.selectedAlbum.id
            : "all"

    const customOrder = useMemo(() => {
        void orderTick
        return getLocalOrderIds(orderScope)
    }, [orderScope, orderTick])

    const sortedTracks = useMemo(
        () => sortTracks(lib.tracks, trackSort, customOrder),
        [lib.tracks, trackSort, customOrder],
    )

    const dragEnabled = trackSort === "custom"

    useEffect(() => {
        function onOrder() {
            setOrderTick((n) => n + 1)
        }
        window.addEventListener(ORDER_EVENT, onOrder)
        return () => window.removeEventListener(ORDER_EVENT, onOrder)
    }, [])

    function handleTrackReorder(next: Track[]) {
        const ids = next.map((item) => item.id)
        if (orderScope === "all") {
            setLocalAllOrder(ids)
        } else {
            setLocalAlbumOrder(orderScope, ids)
        }
    }

    const sortedAlbums = useMemo(
        () =>
            sortLocalAlbums(
                // 根视图只展示独立专辑；艺人下专辑在艺人详情中展示
                lib.library.albums.filter((album) => album.artistId == null),
                localAlbumSort,
                (album) =>
                    lib.library.tracks.filter((track) => track.albumId === album.id)
                        .length,
                getLocalAlbumListOrder(),
            ),
        [lib.library.albums, lib.library.tracks, localAlbumSort, orderTick],
    )

    const sortedArtists = useMemo(
        () =>
            [...lib.library.artists].sort((a, b) =>
                a.name.localeCompare(b.name, "zh-CN"),
            ),
        [lib.library.artists],
    )

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerMode, setDrawerMode] = useState<LocalAlbumDrawerMode>("create")
    const [editAlbumId, setEditAlbumId] = useState<string | null>(null)
    const [drawerInitial, setDrawerInitial] = useState<AlbumDraft>({
        title: "",
        artist: "",
        coverDataUrl: "",
        folderPath: null,
    })
    const [confirm, setConfirm] = useState<ConfirmState>({ kind: "none" })
    const [artistDrawerOpen, setArtistDrawerOpen] = useState(false)
    const [artistEditId, setArtistEditId] = useState<string | null>(null)
    const [artistInitial, setArtistInitial] = useState<{
        name: string
        coverDataUrl: string
    }>({ name: "", coverDataUrl: "" })

    function openArtistEditDrawer(artist: LocalArtist) {
        setArtistEditId(artist.id)
        setArtistInitial({
            name: artist.name,
            coverDataUrl: artist.coverDataUrl,
        })
        setArtistDrawerOpen(true)
    }

    function handleArtistDrawerSubmit(draft: { name: string; coverDataUrl: string }) {
        if (artistEditId) {
            lib.editArtist(artistEditId, draft)
        }
        setArtistDrawerOpen(false)
    }

    // —— 多选批量操作 ——
    const [selectionMode, setSelectionMode] = useState<"album" | "artist" | null>(null)
    const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
    // 批量加入歌单的曲目集合，非空即弹出选择弹窗
    const [playlistAddTracks, setPlaylistAddTracks] = useState<Track[]>([])

    function toggleSelection(id: string) {
        setSelection((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    function selectAllModeItems() {
        if (selectionMode === "artist") {
            setSelection(new Set(sortedArtists.map((item) => item.id)))
        } else if (selectionMode === "album") {
            const albums =
                lib.nav.kind === "artist" ? lib.artistAlbums : sortedAlbums
            setSelection(new Set(albums.map((item) => item.id)))
        }
    }

    function exitSelectionMode() {
        setSelectionMode(null)
        setSelection(new Set())
    }

    function handleBulkDelete() {
        if (selection.size === 0) {
            return
        }
        if (selectionMode === "artist") {
            const artists = sortedArtists.filter((item) => selection.has(item.id))
            if (artists.length > 0) {
                const albumCount = artists.reduce(
                    (sum, item) =>
                        sum +
                        lib.library.albums.filter(
                            (album) => album.artistId === item.id,
                        ).length,
                    0,
                )
                setConfirm({ kind: "remove-artists", artists, albumCount })
            }
        } else if (selectionMode === "album") {
            const albums =
                lib.nav.kind === "artist"
                    ? lib.artistAlbums.filter((item) => selection.has(item.id))
                    : sortedAlbums.filter((item) => selection.has(item.id))
            if (albums.length > 0) {
                setConfirm({ kind: "remove-albums", albums })
            }
        }
    }

    function openCreateDrawer() {
        setDrawerMode("create")
        setEditAlbumId(null)
        setDrawerInitial({
            title: "",
            artist: "",
            coverDataUrl: "",
            folderPath: null,
        })
        setDrawerOpen(true)
    }

    // 把选中的专辑或艺人下所有本地曲目汇集，交给加入歌单弹窗批量写入
    function handleAddSelectionToPlaylist() {
        if (selection.size === 0) {
            return
        }
        const gathered: Track[] = []
        if (selectionMode === "album") {
            const albums =
                lib.nav.kind === "artist" ? lib.artistAlbums : sortedAlbums
            for (const album of albums) {
                if (selection.has(album.id)) {
                    gathered.push(...listTracksByAlbum(lib.library, album.id))
                }
            }
        } else if (selectionMode === "artist") {
            const artists = sortedArtists.filter((item) =>
                selection.has(item.id),
            )
            for (const artist of artists) {
                for (const album of lib.library.albums) {
                    if (album.artistId === artist.id) {
                        gathered.push(...listTracksByAlbum(lib.library, album.id))
                    }
                }
            }
        }
        const seen = new Set<string>()
        const unique = gathered.filter((item) => {
            if (seen.has(item.id)) {
                return false
            }
            seen.add(item.id)
            return true
        })
        setPlaylistAddTracks(unique)
    }

    function openEditDrawer(album: LocalAlbum) {
        setDrawerMode("edit")
        setEditAlbumId(album.id)
        setDrawerInitial({
            title: album.title,
            artist: album.artist,
            coverDataUrl: lib.albumCover(album),
            folderPath: album.folderPath,
            artistId: album.artistId,
        })
        setDrawerOpen(true)
    }

    async function handleDrawerSubmit(draft: AlbumDraft) {
        try {
            if (drawerMode === "edit" && editAlbumId) {
                await lib.editAlbum(editAlbumId, draft)
            } else {
                await lib.createAlbum(draft)
            }
            setDrawerOpen(false)
        } catch {
            // hook 已 toast
        }
    }

    function handleConfirmAction(includeAlbums = false) {
        if (confirm.kind === "clear") {
            lib.clearAll()
        } else if (confirm.kind === "remove") {
            lib.deleteAlbum(confirm.album)
        } else if (confirm.kind === "remove-artist") {
            lib.deleteArtist(confirm.artist, includeAlbums)
        } else if (confirm.kind === "remove-artists") {
            lib.deleteArtists(
                confirm.artists.map((item) => item.id),
                includeAlbums,
            )
        } else if (confirm.kind === "remove-albums") {
            lib.deleteAlbums(confirm.albums.map((item) => item.id))
        }
        exitSelectionMode()
        setConfirm({ kind: "none" })
    }

    async function enrichTracksFromNetease(tracks: Track[]) {
        const pending = tracks.filter(needsNeteaseMetadata)
        if (pending.length === 0) {
            notifySuccess("封面和歌词已经齐全")
            return
        }

        setMetadataBusy(true)
        let matched = 0
        let covers = 0
        let lyrics = 0
        try {
            for (let index = 0; index < pending.length; index += 3) {
                const batch = pending.slice(index, index + 3)
                const results = await Promise.allSettled(
                    batch.map((track) =>
                        applyNeteaseMetadata(track, { onlyMissing: true }),
                    ),
                )
                for (const result of results) {
                    if (result.status !== "fulfilled" || !result.value.matched) {
                        continue
                    }
                    matched += 1
                    if (result.value.coverApplied) covers += 1
                    if (result.value.lyricApplied) lyrics += 1
                }
            }
            // 专辑无封面时，用补全到的第一首曲目封面设置专辑封面（已设置过则不动）
            if (
                lib.nav.kind === "album" &&
                lib.selectedAlbum &&
                !lib.selectedAlbum.coverDataUrl
            ) {
                const album = lib.selectedAlbum
                const withCover = pending.find((track) => getCoverOverride(track.id))
                if (withCover) {
                    const override = getCoverOverride(withCover.id)
                    if (override) {
                        try {
                            await lib.editAlbum(album.id, {
                                title: album.title,
                                artist: album.artist,
                                coverDataUrl:
                                    coverPathToUrl(override.originalPath) ||
                                    override.originalPath,
                                folderPath: album.folderPath,
                                artistId: album.artistId,
                            })
                        } catch {
                            // 专辑封面设置失败不影响已完成的补全
                        }
                    }
                }
            }
            notifySuccess("网易云补全完成", {
                description: `匹配 ${matched}/${pending.length} 首 · 封面 ${covers} · 歌词 ${lyrics}`,
            })
        } catch (error) {
            notifyError("批量补全失败", {
                description: error instanceof Error ? error.message : "请稍后重试",
            })
        } finally {
            setMetadataBusy(false)
        }
    }

    // —— 艺人详情：该艺人的专辑网格 ——
    if (lib.nav.kind === "artist" && lib.selectedArtist) {
        const artist = lib.selectedArtist
        const artistTrackList = lib.artistAlbums.flatMap((album) =>
            listTracksByAlbum(lib.library, album.id),
        )
        const artistCover =
            artist.coverDataUrl ||
            lib.albumCoverThumb(lib.artistAlbums[0] ?? ({} as LocalAlbum)) ||
            ""

        return (
            <div className="space-y-6 pb-4">
                <BackButton onClick={lib.goRoot} label="资料库" />

                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                        <Cover
                            src={artistCover}
                            alt={artist.name}
                            size="lg"
                            className="size-28 shrink-0 rounded-full shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.1] sm:size-36"
                        />
                        <div className="min-w-0 space-y-2 pb-1">
                            <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase sm:text-[12px]">
                                艺人 / 合集
                            </p>
                            <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.04em] sm:text-[28px] md:text-[32px] md:font-semibold">
                                {artist.name}
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                {lib.artistAlbums.length} 张专辑 · {artistTrackList.length} 首
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {artistTrackList.length > 0 ? (
                            <button
                                type="button"
                                disabled={metadataBusy}
                                onClick={() =>
                                    void enrichTracksFromNetease(artistTrackList)
                                }
                                className="apple-primary-action inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:opacity-40"
                            >
                                {metadataBusy ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="size-3.5" />
                                )}
                                {metadataBusy ? "正在获取…" : "网易云补全封面歌词"}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => openArtistEditDrawer(artist)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            <Pencil className="size-3.5" />
                            编辑
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                selectionMode === "album"
                                    ? exitSelectionMode()
                                    : setSelectionMode("album")
                            }
                            className={cn(
                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)]",
                                selectionMode === "album"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-[var(--surface-fill)] hover:bg-[var(--surface-fill-hover)]",
                            )}
                        >
                            <SquareCheck className="size-3.5" />
                            {selectionMode === "album" ? "完成" : "管理"}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                setConfirm({
                                    kind: "remove-artist",
                                    artist,
                                    albumCount: lib.library.albums.filter(
                                        (album) => album.artistId === artist.id,
                                    ).length,
                                })
                            }
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            <Trash2 className="size-3.5" />
                            删除分组
                        </button>
                    </div>
                </header>

                {lib.artistAlbums.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="该艺人暂无专辑"
                        description="导入艺人文件夹或在该艺人的专辑详情中添加音乐"
                        icon={MicVocal}
                    />
                ) : (
                    <Section
                        title="专辑"
                        description={`${lib.artistAlbums.length} 张 · 点开进入曲目`}
                    >
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {lib.artistAlbums.map((album) => {
                                const count = lib.library.tracks.filter(
                                    (track) => track.albumId === album.id,
                                ).length
                                const selected = selection.has(album.id)
                                return (
                                    <div key={album.id} className="group relative">
                                        <MediaCard
                                            coverUrl={lib.albumCoverThumb(album)}
                                            title={album.title}
                                            subtitle={`${album.artist || "未知艺人"} · ${count} 首`}
                                            widthClassName="w-full"
                                            onClick={() =>
                                                selectionMode === "album"
                                                    ? toggleSelection(album.id)
                                                    : lib.openAlbum(album.id)
                                            }
                                        />
                                        {selectionMode === "album" ? (
                                            <SelectionBadge selected={selected} />
                                        ) : (
                                            <div className="absolute top-2 right-2">
                                                <LocalAlbumMenu
                                                    album={album}
                                                    busy={lib.submitting}
                                                    overlay
                                                    onEdit={openEditDrawer}
                                                    onRescan={(item) =>
                                                        void lib.rescanAlbum(item)
                                                    }
                                                    onDelete={(item) =>
                                                        setConfirm({
                                                            kind: "remove",
                                                            album: item,
                                                        })
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </Section>
                )}

                <LocalAlbumDrawer
                    open={drawerOpen}
                    mode={drawerMode}
                    initial={drawerInitial}
                    artists={lib.library.artists}
                    submitting={lib.submitting}
                    onOpenChange={setDrawerOpen}
                    onSubmit={handleDrawerSubmit}
                />

                <LocalArtistDrawer
                    open={artistDrawerOpen}
                    initial={artistInitial}
                    submitting={lib.submitting}
                    onOpenChange={setArtistDrawerOpen}
                    onSubmit={handleArtistDrawerSubmit}
                />

                <ConfirmDialog
                    confirm={confirm}
                    onOpenChange={(open) => {
                        if (!open) {
                            setConfirm({ kind: "none" })
                        }
                    }}
                    onConfirm={handleConfirmAction}
                />

                {lib.submitting ? <BusyPill /> : null}
                {selectionMode ? (
                    <BulkActionBar
                        mode={selectionMode}
                        count={selection.size}
                        canSwitch={false}
                        onSwitchMode={() => {}}
                        onSelectAll={selectAllModeItems}
                        onDelete={handleBulkDelete}
                        onDone={exitSelectionMode}
                    />
                ) : null}
            </div>
        )
    }

    // —— 专辑曲目 / 全部歌曲 详情 ——
    if (lib.nav.kind === "album" || lib.nav.kind === "all") {
        const title =
            lib.nav.kind === "all"
                ? "全部歌曲"
                : lib.selectedAlbum?.title || "专辑"
        const description =
            lib.nav.kind === "all"
                ? `${lib.tracks.length} 首`
                : `${lib.tracks.length} 首${
                      lib.selectedAlbum?.artist
                          ? ` · ${lib.selectedAlbum.artist}`
                          : ""
                  }`

        return (
            <div className="space-y-5 pb-4">
                <BackButton onClick={lib.goRoot} label="资料库" />

                <header className="flex flex-wrap items-end justify-between gap-3 px-0.5">
                    <div className="min-w-0">
                        <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.04em] sm:text-[26px] md:text-[28px] md:font-semibold">
                            {title}
                        </h1>
                        <p className="mt-0.5 text-[12px] text-muted-foreground sm:text-[13px]">
                            {description}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {sortedTracks.length > 0 ? (
                            <SortSelect
                                value={trackSort}
                                options={TRACK_SORT_OPTIONS}
                                onChange={setTrackSort}
                                label="歌曲排序"
                            />
                        ) : null}
                        {sortedTracks[0] ? (
                            <button
                                type="button"
                                onClick={() => {
                                    const first = sortedTracks[0]
                                    if (first) {
                                        playOrToggle(first, sortedTracks)
                                    }
                                }}
                                className="h-9 cursor-pointer rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
                            >
                                播放
                            </button>
                        ) : null}
                        {sortedTracks.length > 0 ? (
                            <button
                                type="button"
                                disabled={metadataBusy}
                                onClick={() =>
                                    void enrichTracksFromNetease(sortedTracks)
                                }
                                className="apple-primary-action inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:opacity-40"
                            >
                                {metadataBusy ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="size-3.5" />
                                )}
                                {metadataBusy ? "正在获取…" : "补全封面歌词"}
                            </button>
                        ) : null}
                        {lib.nav.kind === "all" ? (
                            <button
                                type="button"
                                disabled={!lib.desktop || lib.submitting}
                                onClick={() => void lib.importTracks(null)}
                                className="apple-primary-action inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:opacity-40"
                            >
                                <FilePlus2 className="size-3.5" />
                                添加单曲
                            </button>
                        ) : null}
                        {lib.selectedAlbum ? (
                            <LocalAlbumMenu
                                album={lib.selectedAlbum}
                                busy={lib.submitting}
                                onAddTracks={(album) =>
                                    void lib.importTracks(album.id)
                                }
                                onEdit={openEditDrawer}
                                onRescan={(album) => void lib.rescanAlbum(album)}
                                onDelete={(album) =>
                                    setConfirm({ kind: "remove", album })
                                }
                            />
                        ) : null}
                    </div>
                </header>

                {sortedTracks.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="暂无曲目"
                        description={
                            lib.nav.kind === "all"
                                ? "可点「添加单曲」选择文件，或导入文件夹"
                                : "可点「添加音乐」从任意位置选文件，不限本专辑文件夹"
                        }
                        icon={Disc3}
                        action={
                            lib.desktop ? (
                                <button
                                    type="button"
                                    disabled={lib.submitting}
                                    onClick={() =>
                                        void lib.importTracks(
                                            lib.nav.kind === "album"
                                                ? lib.selectedAlbum?.id
                                                : null,
                                        )
                                    }
                                    className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-40"
                                >
                                    <FilePlus2 className="size-3.5" />
                                    {lib.nav.kind === "all"
                                        ? "添加单曲"
                                        : "添加音乐"}
                                </button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="apple-list-surface p-1.5">
                        {dragEnabled ? (
                            <DragList
                                items={sortedTracks}
                                enabled
                                onReorder={handleTrackReorder}
                                renderItem={(track, index, handle) => (
                                    <TrackRow
                                        track={track}
                                        index={index}
                                        leading={handle}
                                        isActive={currentTrack?.id === track.id}
                                        isPlaying={
                                            currentTrack?.id === track.id && isPlaying
                                        }
                                        showSource={false}
                                        onPlay={(item) =>
                                            playOrToggle(item, sortedTracks)
                                        }
                                        onLocalRemove={() =>
                                            lib.deleteTrack(track.id)
                                        }
                                    />
                                )}
                            />
                        ) : (
                            <VirtualList
                                items={sortedTracks}
                                itemHeight={58}
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
                                        onPlay={(item) =>
                                            playOrToggle(item, sortedTracks)
                                        }
                                        onLocalRemove={() =>
                                            lib.deleteTrack(track.id)
                                        }
                                    />
                                )}
                            />
                        )}
                    </div>
                )}

                <LocalAlbumDrawer
                    open={drawerOpen}
                    mode={drawerMode}
                    initial={drawerInitial}
                    artists={lib.library.artists}
                    submitting={lib.submitting}
                    onOpenChange={setDrawerOpen}
                    onSubmit={handleDrawerSubmit}
                />

                <ConfirmDialog
                    confirm={confirm}
                    onOpenChange={(open) => {
                        if (!open) {
                            setConfirm({ kind: "none" })
                        }
                    }}
                    onConfirm={handleConfirmAction}
                />

                {lib.submitting ? <BusyPill /> : null}
            </div>
        )
    }

    // —— 资料库根：艺人分组 + 专辑网格 ——
    return (
        <div className="space-y-7 pb-4">
            <PageTitle
                title="资料库"
                subtitle={lib.subtitle}
                trailing={
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                disabled={lib.submitting}
                                className={cn(
                                    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full",
                                    "apple-primary-action px-3.5 text-[13px] font-semibold",
                                    "transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
                                )}
                            >
                                {lib.submitting ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <Plus className="size-3.5" strokeWidth={2.4} />
                                )}
                                {lib.submitting ? "处理中…" : "新建"}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                sideOffset={8}
                                className="w-52 p-1.5"
                            >
                                <DropdownMenuItem
                                    onClick={openCreateDrawer}
                                    className="cursor-pointer"
                                >
                                    <Plus className="size-4" strokeWidth={2.2} />
                                    <span className="flex flex-col">
                                        <span>新建专辑</span>
                                        <span className="text-[11px] font-normal text-muted-foreground">
                                            空专辑，可手动加曲
                                        </span>
                                    </span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!lib.desktop || lib.submitting}
                                    onClick={() => void lib.importFolder()}
                                    className="cursor-pointer"
                                >
                                    <FolderOpen className="size-4" />
                                    <span className="flex flex-col">
                                        <span>导入专辑文件夹</span>
                                        <span className="text-[11px] font-normal text-muted-foreground">
                                            整夹导入为一张专辑
                                        </span>
                                    </span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!lib.desktop || lib.submitting}
                                    onClick={() => void lib.importArtistFolder()}
                                    className="cursor-pointer"
                                >
                                    <MicVocal className="size-4" />
                                    <span className="flex flex-col">
                                        <span>导入艺人文件夹</span>
                                        <span className="text-[11px] font-normal text-muted-foreground">
                                            子专辑文件夹自动归组
                                        </span>
                                    </span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!lib.desktop || lib.submitting}
                                    onClick={() => void lib.importTracks(null)}
                                    className="cursor-pointer"
                                >
                                    <FilePlus2 className="size-4" />
                                    <span className="flex flex-col">
                                        <span>添加单曲</span>
                                        <span className="text-[11px] font-normal text-muted-foreground">
                                            选择任意音频文件
                                        </span>
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {selectionMode ? (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={selection.size === 0}
                                    onClick={handleAddSelectionToPlaylist}
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.97] disabled:opacity-45"
                                >
                                    <Library className="size-3.5" />
                                    加入歌单
                                </button>
                                <button
                                    type="button"
                                    onClick={exitSelectionMode}
                                    className="apple-primary-action inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.97]"
                                >
                                    <SquareCheck className="size-3.5" />
                                    完成
                                </button>
                            </div>
                        ) : lib.library.tracks.length > 0 ||
                          lib.library.albums.length > 0 ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    type="button"
                                    title="更多操作"
                                    aria-label="资料库更多操作"
                                    className={cn(
                                        "inline-flex size-9 cursor-pointer items-center justify-center rounded-full",
                                        "bg-[var(--surface-fill)] text-foreground transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)]",
                                        "active:scale-[0.97] active:duration-[var(--duration-press)]",
                                    )}
                                >
                                    <MoreHorizontal className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    sideOffset={8}
                                    className="w-48 p-1.5"
                                >
                                    <DropdownMenuItem
                                        onClick={() =>
                                            setSelectionMode(
                                                sortedArtists.length > 0
                                                    ? "artist"
                                                    : "album",
                                            )
                                        }
                                        className="cursor-pointer"
                                    >
                                        <SquareCheck className="size-4" />
                                        <span className="flex flex-col">
                                            <span>批量管理</span>
                                            <span className="text-[11px] font-normal text-muted-foreground">
                                                多选专辑或艺人后删除
                                            </span>
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => setConfirm({ kind: "clear" })}
                                        className="cursor-pointer"
                                    >
                                        <Trash2 className="size-4" />
                                        <span className="flex flex-col">
                                            <span>清空资料库</span>
                                            <span className="text-[11px] font-normal text-muted-foreground">
                                                移除全部本地曲目索引
                                            </span>
                                        </span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                    </>
                }
            />

            {lib.library.albums.length === 0 &&
            lib.library.artists.length === 0 &&
            lib.allTracks.length === 0 ? (
                <StateHero
                    variant="empty"
                    title="资料库是空的"
                    description={
                        lib.desktop
                            ? "点右上角「新建」：新建专辑 · 导入专辑文件夹 · 导入艺人文件夹 · 添加单曲"
                            : "浏览器预览无法选目录，请用桌面应用"
                    }
                    icon={FolderOpen}
                />
            ) : (
                <>
                    {sortedArtists.length > 0 ? (
                        <Section
                            title="艺人"
                            description={`${sortedArtists.length} 位 · 子专辑文件夹自动归组`}
                        >
                            <div ref={gridRef} className={gridClass} style={gridStyle}>
                                {sortedArtists.map((artist) => {
                                    const albums = lib.library.albums.filter(
                                        (album) => album.artistId === artist.id,
                                    )
                                    const cover = toThumbnailUrl(
                                        artist.coverDataUrl ||
                                            lib.albumCover(
                                                albums[0] ?? ({} as LocalAlbum),
                                            ) ||
                                            "",
                                    )
                                    return (
                                        <div key={artist.id} className="group relative">
                                            <MediaCard
                                                coverUrl={cover}
                                                title={artist.name}
                                                subtitle={`${albums.length} 张专辑`}
                                                widthClassName="w-full"
                                                onClick={() =>
                                                    selectionMode === "artist"
                                                        ? toggleSelection(artist.id)
                                                        : lib.openArtist(artist.id)
                                                }
                                            />
                                            {selectionMode === "artist" ? (
                                                <SelectionBadge
                                                    selected={selection.has(artist.id)}
                                                />
                                            ) : (
                                                <div className="absolute top-2 right-2">
                                                    <LocalArtistMenu
                                                        artist={artist}
                                                        overlay
                                                        onEdit={openArtistEditDrawer}
                                                        onDelete={(item) =>
                                                            setConfirm({
                                                                kind: "remove-artist",
                                                                artist: item,
                                                                albumCount: albums.length,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </Section>
                    ) : null}

                    <Section
                        title="专辑"
                        description={`${sortedAlbums.length} 张 · 点开进入曲目`}
                        variant="listen"
                    action={
                        selectionMode === null ? (
                            <div className="flex flex-wrap items-center gap-2">
                                {sortedAlbums.length > 0 ? (
                                    <SortSelect
                                        value={localAlbumSort}
                                        options={LOCAL_ALBUM_SORT_OPTIONS}
                                        onChange={setLocalAlbumSort}
                                        label="专辑排序"
                                    />
                                ) : null}
                                <ViewModeToggle
                                    value={localAlbumView}
                                    onChange={setLocalAlbumView}
                                    label="本地专辑展示"
                                />
                            </div>
                        ) : (
                            <span className="text-[12px] text-muted-foreground">
                                已选 {selection.size} 项
                            </span>
                        )
                    }
                >
                    {localAlbumView === "list" ? (
                        <div className="apple-list-surface space-y-0.5 p-1.5">
                            {selectionMode === null && lib.allTracks.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={lib.openAllSongs}
                                    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-fill)] active:scale-[0.995]"
                                >
                                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/90 to-violet-600/90">
                                        <Disc3 className="size-6 text-white/90" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-medium tracking-[-0.01em]">
                                            全部歌曲
                                        </p>
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {lib.allTracks.length} 首
                                        </p>
                                    </div>
                                </button>
                            ) : null}
                            <DragList
                                items={sortedAlbums}
                                enabled={
                                    selectionMode === null &&
                                    localAlbumSort === "custom"
                                }
                                onReorder={(next) =>
                                    setLocalAlbumListOrder(
                                        next.map((album) => album.id),
                                    )
                                }
                                renderItem={(album, _index, handle) => {
                                    const count = lib.library.tracks.filter(
                                        (track) => track.albumId === album.id,
                                    ).length
                                    const selected = selection.has(album.id)
                                    return (
                                        <div
                                            className={cn(
                                                "group flex items-center gap-1 rounded-2xl transition-colors",
                                                selectionMode === "album" && selected
                                                    ? "bg-primary/[0.08] ring-1 ring-primary/25"
                                                    : "hover:bg-[var(--surface-fill)]",
                                            )}
                                        >
                                            {handle}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    selectionMode === "album"
                                                        ? toggleSelection(album.id)
                                                        : lib.openAlbum(album.id)
                                                }
                                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2.5 py-2 text-left active:scale-[0.995]"
                                            >
                                                <Cover
                                                    src={lib.albumCoverThumb(album)}
                                                    alt={album.title}
                                                    size="sm"
                                                    className="size-12 rounded-xl"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[14px] font-medium tracking-[-0.01em]">
                                                        {album.title}
                                                    </p>
                                                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                                        {album.artist || "未知艺人"} · {count} 首
                                                    </p>
                                                </div>
                                            </button>
                                            <div className="mr-2 shrink-0">
                                                {selectionMode === "album" ? (
                                                    <SelectionBadge selected={selected} />
                                                ) : (
                                                    <LocalAlbumMenu
                                                        album={album}
                                                        busy={lib.submitting}
                                                        onEdit={openEditDrawer}
                                                        onRescan={(item) =>
                                                            void lib.rescanAlbum(item)
                                                        }
                                                        onDelete={(item) =>
                                                            setConfirm({
                                                                kind: "remove",
                                                                album: item,
                                                            })
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )
                                }}
                            />
                        </div>
                    ) : (
                        <div ref={gridRef} className={gridClass} style={gridStyle}>
                            {selectionMode === null && lib.allTracks.length > 0 ? (
                                <MediaCard
                                    coverUrl=""
                                    title="全部歌曲"
                                    subtitle={`${lib.allTracks.length} 首`}
                                    widthClassName="w-full"
                                    onClick={lib.openAllSongs}
                                    overlay={
                                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-500/90 to-violet-600/90">
                                            <Disc3 className="size-12 text-white/90" />
                                        </div>
                                    }
                                />
                            ) : null}
                            {sortedAlbums.map((album) => {
                                const count = lib.library.tracks.filter(
                                    (track) => track.albumId === album.id,
                                ).length
                                const selected = selection.has(album.id)
                                return (
                                    <div key={album.id} className="group relative">
                                        <MediaCard
                                            coverUrl={lib.albumCoverThumb(album)}
                                            title={album.title}
                                            subtitle={`${album.artist || "未知艺人"} · ${count} 首`}
                                            widthClassName="w-full"
                                            onClick={() =>
                                                selectionMode === "album"
                                                    ? toggleSelection(album.id)
                                                    : lib.openAlbum(album.id)
                                            }
                                        />
                                        {selectionMode === "album" ? (
                                            <div className="absolute top-2 left-2">
                                                <SelectionBadge selected={selected} />
                                            </div>
                                        ) : (
                                            <div className="absolute top-2 right-2">
                                                <LocalAlbumMenu
                                                    album={album}
                                                    busy={lib.submitting}
                                                    overlay
                                                    onEdit={openEditDrawer}
                                                    onRescan={(item) =>
                                                        void lib.rescanAlbum(item)
                                                    }
                                                    onDelete={(item) =>
                                                        setConfirm({
                                                            kind: "remove",
                                                            album: item,
                                                        })
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Section>
                </>
            )}

            <LocalAlbumDrawer
                open={drawerOpen}
                mode={drawerMode}
                initial={drawerInitial}
                artists={lib.library.artists}
                submitting={lib.submitting}
                onOpenChange={setDrawerOpen}
                onSubmit={handleDrawerSubmit}
            />

            <LocalArtistDrawer
                open={artistDrawerOpen}
                initial={artistInitial}
                submitting={lib.submitting}
                onOpenChange={setArtistDrawerOpen}
                onSubmit={handleArtistDrawerSubmit}
            />

            <ConfirmDialog
                confirm={confirm}
                onOpenChange={(open) => {
                    if (!open) {
                        setConfirm({ kind: "none" })
                    }
                }}
                onConfirm={handleConfirmAction}
            />

            <AddToPlaylistDialog
                track={null}
                tracks={playlistAddTracks}
                open={playlistAddTracks.length > 0}
                onOpenChange={(open) => {
                    if (!open) {
                        setPlaylistAddTracks([])
                    }
                }}
            />

            {lib.submitting ? <BusyPill /> : null}
            {selectionMode ? (
                <BulkActionBar
                    mode={selectionMode}
                    count={selection.size}
                    canSwitch={lib.nav.kind === "root"}
                    onSwitchMode={(mode) => {
                        setSelectionMode(mode)
                        setSelection(new Set())
                    }}
                    onSelectAll={selectAllModeItems}
                    onDelete={handleBulkDelete}
                    onDone={exitSelectionMode}
                />
            ) : null}
        </div>
    )
}

function ConfirmDialog({
    confirm,
    onOpenChange,
    onConfirm,
}: {
    confirm: ConfirmState
    onOpenChange: (open: boolean) => void
    onConfirm: (includeAlbums: boolean) => void
}) {
    const [includeAlbums, setIncludeAlbums] = useState(false)

    useEffect(() => {
        if (confirm.kind !== "none") {
            setIncludeAlbums(false)
        }
    }, [confirm])

    const open = confirm.kind !== "none"
    const isClear = confirm.kind === "clear"
    const isRemoveArtist =
        confirm.kind === "remove-artist" || confirm.kind === "remove-artists"

    const albumCount =
        confirm.kind === "remove"
            ? 1
            : confirm.kind === "remove-albums"
              ? confirm.albums.length
              : 0
    const artistCount =
        confirm.kind === "remove-artist"
            ? 1
            : confirm.kind === "remove-artists"
              ? confirm.artists.length
              : 0
    const artistName =
        confirm.kind === "remove-artist"
            ? confirm.artist.name
            : confirm.kind === "remove-artists"
              ? confirm.artists.map((item) => item.name).join("、")
              : undefined
    const albumTitle =
        confirm.kind === "remove" ? confirm.album.title : undefined
    const linkedAlbumCount =
        confirm.kind === "remove-artist"
            ? confirm.albumCount ?? 0
            : confirm.kind === "remove-artists"
              ? confirm.albumCount ?? 0
              : 0

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent size="default">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {isClear
                            ? "清空本地资料库？"
                            : isRemoveArtist
                              ? artistCount > 1
                                ? `删除 ${artistCount} 位艺人？`
                                : "删除艺人分组？"
                              : albumCount > 1
                                ? `删除 ${albumCount} 张专辑？`
                                : "删除这张专辑？"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {isClear
                            ? "将移除全部本地专辑与曲目索引，不会删除磁盘上的音频文件。"
                            : isRemoveArtist
                              ? `「${artistName}」${linkedAlbumCount > 0 ? `分组下共 ${linkedAlbumCount} 张专辑，` : ""}删除后磁盘文件保留。`
                              : albumCount > 1
                                ? `${albumCount} 张专辑及其曲目将从资料库移除，不会删除磁盘文件。`
                                : `「${albumTitle}」及其曲目将从资料库移除，不会删除磁盘文件。`}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {isRemoveArtist ? (
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-[var(--surface-fill)] px-3.5 py-3 transition-colors hover:bg-[var(--surface-fill-hover)]">
                        <input
                            type="checkbox"
                            checked={includeAlbums}
                            onChange={(event) =>
                                setIncludeAlbums(event.currentTarget.checked)
                            }
                            className="size-4 cursor-pointer accent-primary"
                        />
                        <span className="text-[13px]">
                            同时删除其下专辑与曲目索引
                            <span className="block text-[11px] text-muted-foreground">
                                磁盘上的音频文件始终保留
                            </span>
                        </span>
                    </label>
                ) : null}

                <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        onClick={() => onConfirm(includeAlbums)}
                    >
                        {isClear ? "清空" : "删除"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function BusyPill() {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center">
            <div className="material-panel flex items-center gap-2 rounded-full px-4 py-2 text-[13px] shadow-lg">
                <Loader2 className="size-4 animate-spin" />
                处理中…
            </div>
        </div>
    )
}

function SelectionBadge({ selected }: { selected: boolean }) {
    return (
        <div
            className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
                selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/95 bg-black/30 text-transparent",
            )}
        >
            <Check className="size-3.5" strokeWidth={3} />
        </div>
    )
}

function BulkActionBar({
    mode,
    count,
    canSwitch = false,
    onSwitchMode,
    onSelectAll,
    onDelete,
    onDone,
}: {
    mode: "album" | "artist"
    count: number
    canSwitch?: boolean
    onSwitchMode: (mode: "album" | "artist") => void
    onSelectAll: () => void
    onDelete: () => void
    onDone: () => void
}) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
            <div className="material-panel pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-full px-2 py-2 text-[13px] shadow-lg">
                {canSwitch ? (
                    <div className="flex items-center gap-0.5 rounded-full bg-[var(--surface-fill)] p-0.5">
                        <button
                            type="button"
                            onClick={() => onSwitchMode("album")}
                            className={cn(
                                "h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium transition-colors",
                                mode === "album"
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground",
                            )}
                        >
                            专辑
                        </button>
                        <button
                            type="button"
                            onClick={() => onSwitchMode("artist")}
                            className={cn(
                                "h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium transition-colors",
                                mode === "artist"
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground",
                            )}
                        >
                            艺人
                        </button>
                    </div>
                ) : null}
                <span className="pl-1.5 text-muted-foreground">已选 {count} 项</span>
                <button
                    type="button"
                    onClick={onSelectAll}
                    className="h-8 cursor-pointer rounded-full px-3 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-[var(--surface-fill)]"
                >
                    全选
                </button>
                <button
                    type="button"
                    disabled={count === 0}
                    onClick={onDelete}
                    className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash2 className="size-3.5" />
                    删除
                </button>
                <button
                    type="button"
                    onClick={onDone}
                    className="h-8 cursor-pointer rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)]"
                >
                    完成
                </button>
            </div>
        </div>
    )
}

export { LocalPage }