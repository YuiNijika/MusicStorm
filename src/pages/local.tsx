import {
    Disc3,
    FilePlus2,
    FolderOpen,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import {
    LocalAlbumDrawer,
    type LocalAlbumDrawerMode,
} from "@/components/music/local-album-drawer"
import { DragList } from "@/components/music/drag-list"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { SortSelect } from "@/components/music/sort-select"
import { StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
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
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { useLocalLibrary } from "@/hooks/use-local-library"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import {
    setLocalAlbumSort,
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
    getLocalOrderIds,
    setLocalAlbumOrder,
    setLocalAllOrder,
} from "@/lib/library/track-order"
import type { AlbumDraft, LocalAlbum } from "@/lib/local/library-store"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type ConfirmState =
    | { kind: "none" }
    | { kind: "clear" }
    | { kind: "remove"; album: LocalAlbum }

function LocalPage() {
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()
    const { trackSort, localAlbumSort } = useLibraryLayout()
    const lib = useLocalLibrary()
    const [orderTick, setOrderTick] = useState(0)

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
                lib.library.albums,
                localAlbumSort,
                (album) =>
                    lib.library.tracks.filter((track) => track.albumId === album.id)
                        .length,
            ),
        [lib.library.albums, lib.library.tracks, localAlbumSort],
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

    function openEditDrawer(album: LocalAlbum) {
        setDrawerMode("edit")
        setEditAlbumId(album.id)
        setDrawerInitial({
            title: album.title,
            artist: album.artist,
            coverDataUrl: album.coverDataUrl.startsWith("data:")
                ? album.coverDataUrl
                : "",
            folderPath: album.folderPath,
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

    function handleConfirmAction() {
        if (confirm.kind === "clear") {
            lib.clearAll()
        } else if (confirm.kind === "remove") {
            lib.deleteAlbum(confirm.album)
        }
        setConfirm({ kind: "none" })
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
                        <h1 className="text-[28px] font-semibold tracking-[-0.04em]">
                            {title}
                        </h1>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
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
                                className="h-9 cursor-pointer rounded-full bg-foreground px-5 text-[13px] font-medium text-background active:scale-[0.97]"
                            >
                                播放
                            </button>
                        ) : null}
                        {lib.nav.kind === "album" && lib.selectedAlbum ? (
                            <button
                                type="button"
                                disabled={!lib.desktop || lib.submitting}
                                onClick={() =>
                                    void lib.importTracks(lib.selectedAlbum!.id)
                                }
                                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground active:scale-[0.97] disabled:opacity-40"
                            >
                                <FilePlus2 className="size-3.5" />
                                添加音乐
                            </button>
                        ) : null}
                        {lib.nav.kind === "all" ? (
                            <button
                                type="button"
                                disabled={!lib.desktop || lib.submitting}
                                onClick={() => void lib.importTracks(null)}
                                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground active:scale-[0.97] disabled:opacity-40"
                            >
                                <FilePlus2 className="size-3.5" />
                                添加单曲
                            </button>
                        ) : null}
                        {lib.selectedAlbum ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() =>
                                        openEditDrawer(lib.selectedAlbum!)
                                    }
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-black/[0.05] px-3.5 text-[13px] font-medium active:scale-[0.97] dark:bg-white/[0.1]"
                                >
                                    <Pencil className="size-3.5" />
                                    编辑
                                </button>
                                {lib.selectedAlbum.folderPath ? (
                                    <button
                                        type="button"
                                        disabled={lib.submitting}
                                        onClick={() =>
                                            void lib.rescanAlbum(
                                                lib.selectedAlbum!,
                                            )
                                        }
                                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-black/[0.05] px-3.5 text-[13px] font-medium active:scale-[0.97] disabled:opacity-40 dark:bg-white/[0.1]"
                                    >
                                        <RefreshCw
                                            className={cn(
                                                "size-3.5",
                                                lib.submitting && "animate-spin",
                                            )}
                                        />
                                        再扫
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() =>
                                        setConfirm({
                                            kind: "remove",
                                            album: lib.selectedAlbum!,
                                        })
                                    }
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10 active:scale-[0.97]"
                                >
                                    <Trash2 className="size-3.5" />
                                    删除
                                </button>
                            </>
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
                                    className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-medium text-background active:scale-[0.97] disabled:opacity-40"
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
                    <div className="overflow-hidden rounded-[16px] bg-black/[0.02] dark:bg-white/[0.03]">
                        <DragList
                            items={sortedTracks}
                            enabled={dragEnabled}
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
                                    onPlay={(item) =>
                                        playOrToggle(item, sortedTracks)
                                    }
                                />
                            )}
                        />
                    </div>
                )}

                <LocalAlbumDrawer
                    open={drawerOpen}
                    mode={drawerMode}
                    initial={drawerInitial}
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

    // —— 资料库根：专辑网格 ——
    return (
        <div className="space-y-7 pb-4">
            <PageTitle
                title="资料库"
                subtitle={lib.subtitle}
                trailing={
                    <>
                        <button
                            type="button"
                            onClick={openCreateDrawer}
                            className={cn(
                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full",
                                "bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground",
                                "active:scale-[0.97]",
                            )}
                        >
                            <Plus className="size-3.5" strokeWidth={2.4} />
                            新建
                        </button>
                        <button
                            type="button"
                            disabled={!lib.desktop || lib.submitting}
                            onClick={() => void lib.importTracks(null)}
                            className={cn(
                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full",
                                "bg-black/[0.05] px-3.5 text-[13px] font-semibold text-foreground",
                                "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                                "dark:bg-white/[0.1]",
                            )}
                        >
                            <FilePlus2 className="size-3.5" />
                            单曲
                        </button>
                        <button
                            type="button"
                            disabled={!lib.desktop || lib.submitting}
                            onClick={() => void lib.importFolder()}
                            className={cn(
                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full",
                                "bg-black/[0.05] px-3.5 text-[13px] font-semibold text-foreground",
                                "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                                "dark:bg-white/[0.1]",
                            )}
                        >
                            {lib.submitting ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <FolderOpen className="size-3.5" />
                            )}
                            {lib.submitting ? "导入中…" : "导入"}
                        </button>
                        {lib.library.tracks.length > 0 ||
                        lib.library.albums.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setConfirm({ kind: "clear" })}
                                className="h-9 cursor-pointer rounded-full px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.97]"
                            >
                                清空
                            </button>
                        ) : null}
                    </>
                }
            />

            {lib.library.albums.length === 0 && lib.allTracks.length === 0 ? (
                <StateHero
                    variant="empty"
                    title="资料库是空的"
                    description={
                        lib.desktop
                            ? "「单曲」选文件 · 「导入」整夹 · 「新建」空专辑后可随时加曲"
                            : "浏览器预览无法选目录，请用桌面应用"
                    }
                    icon={FolderOpen}
                />
            ) : (
                <Section
                    title="专辑"
                    description={`${sortedAlbums.length} 张 · 点开进入曲目`}
                    variant="listen"
                    action={
                        <div className="flex flex-wrap items-center gap-2">
                            {sortedAlbums.length > 0 ? (
                                <SortSelect
                                    value={localAlbumSort}
                                    options={LOCAL_ALBUM_SORT_OPTIONS}
                                    onChange={setLocalAlbumSort}
                                    label="专辑排序"
                                />
                            ) : null}
                            {lib.allTracks.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={lib.openAllSongs}
                                    className="cursor-pointer text-[13px] font-semibold text-primary active:opacity-70"
                                >
                                    全部歌曲
                                </button>
                            ) : null}
                        </div>
                    }
                >
                    <div ref={gridRef} className={gridClass} style={gridStyle}>
                        {lib.allTracks.length > 0 ? (
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
                            return (
                                <div key={album.id} className="group relative">
                                    <MediaCard
                                        coverUrl={lib.albumCover(album)}
                                        title={album.title}
                                        subtitle={`${album.artist || "未知艺人"} · ${count} 首`}
                                        widthClassName="w-full"
                                        onClick={() => lib.openAlbum(album.id)}
                                    />
                                    <button
                                        type="button"
                                        title="移除专辑"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            setConfirm({
                                                kind: "remove",
                                                album,
                                            })
                                        }}
                                        className={cn(
                                            "absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full",
                                            "bg-black/55 text-white opacity-0 backdrop-blur-md",
                                            "transition-opacity group-hover:opacity-100 active:scale-[0.95]",
                                        )}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
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

function ConfirmDialog({
    confirm,
    onOpenChange,
    onConfirm,
}: {
    confirm: ConfirmState
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
}) {
    const open = confirm.kind !== "none"
    const isClear = confirm.kind === "clear"
    const albumTitle =
        confirm.kind === "remove" ? confirm.album.title : undefined

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent size="default">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {isClear ? "清空本地资料库？" : "删除这张专辑？"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {isClear
                            ? "将移除全部本地专辑与曲目索引，不会删除磁盘上的音频文件。"
                            : `「${albumTitle}」及其曲目将从资料库移除，不会删除磁盘文件。`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        onClick={onConfirm}
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

export { LocalPage }