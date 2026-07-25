import { Disc3, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { HScroll } from "@/components/music/h-scroll"
import {
    LocalAlbumDrawer,
    type LocalAlbumDrawerMode,
} from "@/components/music/local-album-drawer"
import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { usePlayer } from "@/hooks/use-player"
import {
    commitCreateAlbum,
    commitFolderAlbum,
    isTauriRuntime,
    libraryNeedsMetaRescan,
    pickMusicFolder,
    rescanLocalLibraryMeta,
} from "@/lib/local/import-folder"
import {
    clearLocalLibrary,
    listLocalPlayableTracks,
    listTracksByAlbum,
    loadLocalLibrary,
    removeAlbum,
    resolveAlbumCoverUrl,
    type AlbumDraft,
    type LocalAlbum,
    type LocalLibraryState,
} from "@/lib/local/library-store"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

type LocalTab = "albums" | "songs"

function LocalPage() {
    const { playOrToggle, currentTrack, isPlaying } = usePlayer()
    const [library, setLibrary] = useState<LocalLibraryState>(() => loadLocalLibrary())
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
    const [statusText, setStatusText] = useState<string | null>(null)
    const [tab, setTab] = useState<LocalTab>("albums")

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerMode, setDrawerMode] = useState<LocalAlbumDrawerMode>("create")
    const [drawerInitial, setDrawerInitial] = useState<AlbumDraft>({
        title: "",
        artist: "",
        coverDataUrl: "",
        folderPath: null,
    })
    const [submitting, setSubmitting] = useState(false)

    const desktop = isTauriRuntime()
    const allTracks = useMemo(() => listLocalPlayableTracks(library), [library])
    const tracks = useMemo(() => {
        if (!selectedAlbumId) {
            return allTracks
        }
        return listTracksByAlbum(library, selectedAlbumId)
    }, [allTracks, library, selectedAlbumId])

    const selectedAlbum = library.albums.find((album) => album.id === selectedAlbumId) ?? null

    useEffect(() => {
        if (!desktop || !libraryNeedsMetaRescan(library)) {
            return
        }
        let cancelled = false
        setStatusText("正在补扫本地元数据…")
        void rescanLocalLibraryMeta(library).then((next) => {
            if (cancelled) {
                return
            }
            setLibrary(next)
            const withCover = next.tracks.filter((t) => t.coverPath).length
            const withLrc = next.tracks.filter((t) => t.lrcPath || t.lyricText).length
            setStatusText(`元数据已更新 · 封面 ${withCover} · 歌词 ${withLrc}`)
            notifySuccess("本地元数据已补扫", {
                description: `封面 ${withCover} 首 · 歌词 ${withLrc} 首`,
            })
        })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desktop])

    function openCreateDrawer() {
        setDrawerMode("create")
        setDrawerInitial({
            title: "",
            artist: "",
            coverDataUrl: "",
            folderPath: null,
        })
        setDrawerOpen(true)
    }

    async function handlePickFolder() {
        if (!desktop) {
            setStatusText("请在桌面应用中选择文件夹")
            return
        }
        try {
            const folderPath = await pickMusicFolder()
            if (!folderPath) {
                return
            }
            // 选文件夹后直接扫描导入：专辑名/艺人从内嵌标签推导，无需再填抽屉
            setSubmitting(true)
            setStatusText("正在扫描并导入…")
            const result = await commitFolderAlbum({
                title: "",
                artist: "",
                coverDataUrl: "",
                folderPath,
            })
            setLibrary(result.state)
            setSelectedAlbumId(result.album.id)
            setTab("songs")
            const msg =
                result.added > 0
                    ? `已导入 ${result.added} 首 · ${result.album.title}`
                    : `未找到音频 · ${result.album.title}`
            setStatusText(msg)
            notifySuccess(result.added > 0 ? "导入完成" : "扫描完成", {
                description: msg,
            })
        } catch (error) {
            if (error instanceof Error && error.message === "CANCELLED") {
                return
            }
            notifyError("导入失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
            setStatusText(null)
        } finally {
            setSubmitting(false)
        }
    }

    async function handleDrawerSubmit(draft: AlbumDraft) {
        setSubmitting(true)
        try {
            // 抽屉仅用于「新建专辑」；文件夹导入已走 handlePickFolder
            if (drawerMode === "folder" && draft.folderPath) {
                const result = await commitFolderAlbum(draft)
                setLibrary(result.state)
                setSelectedAlbumId(result.album.id)
                setTab("songs")
                setDrawerOpen(false)
                const msg =
                    result.added > 0
                        ? `已导入 ${result.added} 首 · ${result.album.title}`
                        : `未找到音频 · ${result.album.title}`
                setStatusText(msg)
                notifySuccess(result.added > 0 ? "导入完成" : "扫描完成", {
                    description: msg,
                })
            } else {
                const result = commitCreateAlbum(draft)
                setLibrary(result.state)
                setSelectedAlbumId(result.album.id)
                setDrawerOpen(false)
                setStatusText(`已创建专辑 · ${result.album.title}`)
                notifySuccess("专辑已创建", { description: result.album.title })
            }
        } catch (error) {
            if (error instanceof Error && error.message === "CANCELLED") {
                return
            }
            notifyError(drawerMode === "folder" ? "导入失败" : "创建失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
        } finally {
            setSubmitting(false)
        }
    }

    function handleClear() {
        setLibrary(clearLocalLibrary())
        setSelectedAlbumId(null)
        setStatusText("已清空本地曲库")
    }

    function handleRemoveAlbum(album: LocalAlbum) {
        setLibrary(removeAlbum(library, album.id))
        if (selectedAlbumId === album.id) {
            setSelectedAlbumId(null)
        }
        setStatusText(`已移除 ${album.title}`)
    }

    function handlePlay(track: Track) {
        playOrToggle(track, tracks)
    }

    function selectAlbum(albumId: string | null) {
        setSelectedAlbumId(albumId)
        if (albumId) {
            setTab("songs")
        }
    }

    const subtitle =
        statusText ??
        (library.albums.length > 0
            ? `${library.albums.length} 张专辑 · ${allTracks.length} 首`
            : desktop
              ? "导入本机高品质音频"
              : "请使用桌面应用导入")

    return (
        <div className="space-y-7 pb-4">
            <PageTitle
                title="资料库"
                subtitle={subtitle}
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
                            disabled={!desktop || submitting}
                            onClick={() => void handlePickFolder()}
                            className={cn(
                                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full",
                                "bg-black/[0.05] px-3.5 text-[13px] font-semibold text-foreground",
                                "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                                "dark:bg-white/[0.1]",
                            )}
                        >
                            {submitting ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <FolderOpen className="size-3.5" />
                            )}
                            {submitting ? "导入中…" : "导入"}
                        </button>
                        {library.tracks.length > 0 || library.albums.length > 0 ? (
                            <button
                                type="button"
                                onClick={handleClear}
                                className="h-9 cursor-pointer rounded-full px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.97]"
                            >
                                清空
                            </button>
                        ) : null}
                    </>
                }
            />

            {/* Apple Music 分段控件 */}
            <div className="flex justify-center">
                <div className="inline-flex rounded-full bg-black/[0.06] p-0.5 dark:bg-white/[0.1]">
                    {(
                        [
                            { id: "albums", label: "专辑" },
                            { id: "songs", label: "歌曲" },
                        ] as const
                    ).map((item) => {
                        const active = tab === item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setTab(item.id)}
                                className={cn(
                                    "h-8 min-w-[88px] cursor-pointer rounded-full px-4 text-[13px] font-semibold transition-all",
                                    active
                                        ? "bg-background text-foreground shadow-sm dark:bg-white/15"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {item.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {tab === "albums" ? (
                library.albums.length === 0 ? (
                    <StateHero
                        variant="empty"
                        title="资料库是空的"
                        description={
                            desktop
                                ? "点「导入」选择文件夹，或「新建」创建专辑"
                                : "浏览器预览无法选目录，请用桌面应用"
                        }
                        icon={FolderOpen}
                    />
                ) : (
                    <Section
                        title="专辑"
                        description={`${library.albums.length} 张`}
                        variant="listen"
                    >
                        <HScroll>
                            <div className="snap-start">
                                <MediaCard
                                    coverUrl=""
                                    title="全部歌曲"
                                    subtitle={`${allTracks.length} 首`}
                                    active={selectedAlbumId == null}
                                    onClick={() => selectAlbum(null)}
                                    widthClassName="w-[148px]"
                                    overlay={
                                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-500/90 to-violet-600/90">
                                            <Disc3 className="size-12 text-white/90" />
                                        </div>
                                    }
                                />
                            </div>
                            {library.albums.map((album) => {
                                const count = library.tracks.filter(
                                    (track) => track.albumId === album.id,
                                ).length
                                return (
                                    <div key={album.id} className="group relative snap-start">
                                        <MediaCard
                                            coverUrl={resolveAlbumCoverUrl(album, library)}
                                            title={album.title}
                                            subtitle={`${album.artist || "未知艺人"} · ${count} 首`}
                                            active={selectedAlbumId === album.id}
                                            onClick={() => selectAlbum(album.id)}
                                            widthClassName="w-[148px]"
                                        />
                                        <button
                                            type="button"
                                            title="移除专辑"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                handleRemoveAlbum(album)
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
                        </HScroll>

                        {selectedAlbum || allTracks.length > 0 ? (
                            <div className="mt-6 space-y-3">
                                <div className="flex items-end justify-between px-0.5">
                                    <div>
                                        <h3 className="text-[18px] font-semibold tracking-[-0.03em]">
                                            {selectedAlbum ? selectedAlbum.title : "最近曲目"}
                                        </h3>
                                        <p className="text-[13px] text-muted-foreground">
                                            {tracks.length} 首
                                            {selectedAlbum?.artist
                                                ? ` · ${selectedAlbum.artist}`
                                                : ""}
                                        </p>
                                    </div>
                                    {selectedAlbum ? (
                                        <button
                                            type="button"
                                            onClick={() => setTab("songs")}
                                            className="cursor-pointer text-[13px] font-semibold text-primary active:opacity-70"
                                        >
                                            查看全部
                                        </button>
                                    ) : null}
                                </div>
                                <div className="overflow-hidden rounded-[16px] bg-black/[0.02] dark:bg-white/[0.03]">
                                    {tracks.slice(0, 8).map((track, index) => (
                                        <TrackRow
                                            key={track.id}
                                            track={track}
                                            index={index}
                                            isActive={currentTrack?.id === track.id}
                                            isPlaying={
                                                currentTrack?.id === track.id && isPlaying
                                            }
                                            onPlay={handlePlay}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </Section>
                )
            ) : tracks.length === 0 ? (
                <StateHero
                    variant="empty"
                    title={
                        library.albums.length === 0 ? "尚未导入本地音乐" : "该筛选下暂无曲目"
                    }
                    description={
                        library.albums.length === 0
                            ? "点上方「导入」选择音乐文件夹"
                            : "切换到专辑视图选择其他专辑"
                    }
                    icon={library.albums.length === 0 ? FolderOpen : Disc3}
                />
            ) : (
                <Section
                    title={selectedAlbum ? selectedAlbum.title : "全部歌曲"}
                    description={
                        selectedAlbum
                            ? `${tracks.length} 首${selectedAlbum.artist ? ` · ${selectedAlbum.artist}` : ""}`
                            : `${tracks.length} 首`
                    }
                    variant="listen"
                    action={
                        selectedAlbum ? (
                            <button
                                type="button"
                                onClick={() => setSelectedAlbumId(null)}
                                className="cursor-pointer text-[13px] font-semibold text-primary active:opacity-70"
                            >
                                显示全部
                            </button>
                        ) : null
                    }
                >
                    <div className="overflow-hidden rounded-[16px] bg-black/[0.02] dark:bg-white/[0.03]">
                        {tracks.map((track, index) => (
                            <TrackRow
                                key={track.id}
                                track={track}
                                index={index}
                                isActive={currentTrack?.id === track.id}
                                isPlaying={currentTrack?.id === track.id && isPlaying}
                                onPlay={handlePlay}
                            />
                        ))}
                    </div>
                </Section>
            )}

            <LocalAlbumDrawer
                open={drawerOpen}
                mode={drawerMode}
                initial={drawerInitial}
                submitting={submitting}
                onOpenChange={setDrawerOpen}
                onSubmit={handleDrawerSubmit}
            />

            {submitting ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center">
                    <div className="material-panel flex items-center gap-2 rounded-full px-4 py-2 text-[13px] shadow-lg">
                        <Loader2 className="size-4 animate-spin" />
                        处理中…
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export { LocalPage }