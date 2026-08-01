import { useCallback, useEffect, useMemo, useState } from "react"

import {
    commitCreateAlbum,
    commitFolderAlbum,
    commitMusicFiles,
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
    updateAlbum,
    type AlbumDraft,
    type LocalAlbum,
    type LocalLibraryState,
} from "@/lib/local/library-store"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"

/** 根页 = 专辑；detail = 某专辑曲目；all = 全部歌曲 */
export type LocalNav =
    | { kind: "root" }
    | { kind: "album"; albumId: string }
    | { kind: "all" }

function useLocalLibrary() {
    const desktop = isTauriRuntime()
    const [library, setLibrary] = useState<LocalLibraryState>(() => loadLocalLibrary())
    const [nav, setNav] = useState<LocalNav>({ kind: "root" })
    const [statusText, setStatusText] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const allTracks = useMemo(() => listLocalPlayableTracks(library), [library])

    const selectedAlbum: LocalAlbum | null = useMemo(() => {
        if (nav.kind !== "album") {
            return null
        }
        return library.albums.find((album) => album.id === nav.albumId) ?? null
    }, [library.albums, nav])

    const tracks: Track[] = useMemo(() => {
        if (nav.kind === "album") {
            return listTracksByAlbum(library, nav.albumId)
        }
        if (nav.kind === "all") {
            return allTracks
        }
        return []
    }, [allTracks, library, nav])

    // 旧库缺元数据时自动补扫一次
    useEffect(() => {
        if (!desktop || !libraryNeedsMetaRescan(library)) {
            return
        }
        let cancelled = false
        setStatusText("正在补扫本地元数据…")
        void rescanLocalLibraryMeta(library)
            .then((next) => {
                if (cancelled) {
                    return
                }
                setLibrary(next)
                const withCover = next.tracks.filter((t) => t.coverPath).length
                const withLrc = next.tracks.filter(
                    (t) => t.lrcPath || t.lyricText,
                ).length
                setStatusText(`元数据已更新 · 封面 ${withCover} · 歌词 ${withLrc}`)
                notifySuccess("本地元数据已补扫", {
                    description: `封面 ${withCover} 首 · 歌词 ${withLrc} 首`,
                })
            })
            .catch((error) => {
                if (cancelled) {
                    return
                }
                setStatusText(null)
                notifyError("本地元数据补扫失败", {
                    description: error instanceof Error ? error.message : "请重试",
                })
            })
        return () => {
            cancelled = true
        }
        // 仅启动时
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desktop])

    const goRoot = useCallback(() => setNav({ kind: "root" }), [])
    const openAlbum = useCallback((albumId: string) => {
        setNav({ kind: "album", albumId })
    }, [])
    const openAllSongs = useCallback(() => setNav({ kind: "all" }), [])

    const importFolder = useCallback(async () => {
        if (!desktop) {
            setStatusText("请在桌面应用中选择文件夹")
            notifyError("仅桌面可用", { description: "浏览器预览无法选择目录" })
            return
        }
        try {
            const folderPath = await pickMusicFolder()
            if (!folderPath) {
                return
            }
            setSubmitting(true)
            setStatusText("正在扫描并导入…")
            const result = await commitFolderAlbum({
                title: "",
                artist: "",
                coverDataUrl: "",
                folderPath,
            })
            setLibrary(result.state)
            setNav({ kind: "album", albumId: result.album.id })
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
    }, [desktop])

    const createAlbum = useCallback(async (draft: AlbumDraft) => {
        setSubmitting(true)
        try {
            const result = commitCreateAlbum(draft)
            setLibrary(result.state)
            setNav({ kind: "album", albumId: result.album.id })
            setStatusText(`已创建专辑 · ${result.album.title}`)
            notifySuccess("专辑已创建", { description: result.album.title })
        } catch (error) {
            notifyError("创建失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
            throw error
        } finally {
            setSubmitting(false)
        }
    }, [])

    /** 添加任意路径单曲/多曲；albumId 空则仅进全部歌曲 */
    const importTracks = useCallback(
        async (albumId?: string | null) => {
            if (!desktop) {
                notifyError("仅桌面可用", { description: "浏览器预览无法选文件" })
                return
            }
            try {
                setSubmitting(true)
                setStatusText("正在添加音乐…")
                const result = await commitMusicFiles({
                    albumId: albumId ?? null,
                })
                setLibrary(result.state)
                if (albumId) {
                    setNav({ kind: "album", albumId })
                } else if (result.added > 0) {
                    setNav({ kind: "all" })
                }
                const target = result.album?.title ?? "全部歌曲"
                const msg =
                    result.added > 0
                        ? `已添加 ${result.added} 首 · ${target}`
                        : "未识别到音频文件"
                setStatusText(msg)
                notifySuccess(result.added > 0 ? "添加完成" : "未添加曲目", {
                    description: msg,
                })
            } catch (error) {
                if (error instanceof Error && error.message === "CANCELLED") {
                    setStatusText(null)
                    return
                }
                notifyError("添加失败", {
                    description: error instanceof Error ? error.message : "请重试",
                })
                setStatusText(null)
            } finally {
                setSubmitting(false)
            }
        },
        [desktop],
    )

    const editAlbum = useCallback(
        async (albumId: string, draft: AlbumDraft) => {
            setSubmitting(true)
            try {
                const next = updateAlbum(library, albumId, {
                    title: draft.title,
                    artist: draft.artist,
                    coverDataUrl: draft.coverDataUrl,
                    folderPath: draft.folderPath,
                })
                setLibrary(next)
                setStatusText(`已更新 · ${draft.title}`)
                notifySuccess("专辑已更新", { description: draft.title })
            } catch (error) {
                notifyError("更新失败", {
                    description: error instanceof Error ? error.message : "请重试",
                })
                throw error
            } finally {
                setSubmitting(false)
            }
        },
        [library],
    )

    const rescanAlbum = useCallback(
        async (album: LocalAlbum) => {
            if (!desktop || !album.folderPath) {
                notifyError("无法再扫", { description: "该专辑未关联文件夹" })
                return
            }
            setSubmitting(true)
            setStatusText("正在重新扫描…")
            try {
                const result = await commitFolderAlbum({
                    title: album.title,
                    artist: album.artist,
                    coverDataUrl: album.coverDataUrl.startsWith("data:")
                        ? album.coverDataUrl
                        : "",
                    folderPath: album.folderPath,
                    albumId: album.id,
                })
                setLibrary(result.state)
                const msg = `已再扫 ${result.added} 首 · ${result.album.title}`
                setStatusText(msg)
                notifySuccess("再扫完成", { description: msg })
            } catch (error) {
                notifyError("再扫失败", {
                    description: error instanceof Error ? error.message : "请重试",
                })
            } finally {
                setSubmitting(false)
            }
        },
        [desktop],
    )

    const deleteAlbum = useCallback(
        (album: LocalAlbum) => {
            setLibrary(removeAlbum(library, album.id))
            if (nav.kind === "album" && nav.albumId === album.id) {
                setNav({ kind: "root" })
            }
            setStatusText(`已移除 ${album.title}`)
            notifySuccess("已移除专辑", { description: album.title })
        },
        [library, nav],
    )

    const clearAll = useCallback(() => {
        setLibrary(clearLocalLibrary())
        setNav({ kind: "root" })
        setStatusText("已清空本地曲库")
        notifySuccess("已清空本地资料库")
    }, [])

    const albumCover = useCallback(
        (album: LocalAlbum) => resolveAlbumCoverUrl(album, library),
        [library],
    )

    const subtitle =
        statusText ??
        (library.albums.length > 0
            ? `${library.albums.length} 张专辑 · ${allTracks.length} 首`
            : desktop
              ? "导入本机音乐文件"
              : "请使用桌面应用导入")

    return {
        desktop,
        library,
        nav,
        selectedAlbum,
        tracks,
        allTracks,
        submitting,
        subtitle,
        goRoot,
        openAlbum,
        openAllSongs,
        importFolder,
        importTracks,
        createAlbum,
        editAlbum,
        rescanAlbum,
        deleteAlbum,
        clearAll,
        albumCover,
    }
}

export { useLocalLibrary }