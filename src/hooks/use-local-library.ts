import { useCallback, useEffect, useMemo, useState } from "react"

import {
    commitArtistFolder,
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
    listAlbumsByArtist,
    listLocalPlayableTracks,
    listTracksByAlbum,
    loadLocalLibrary,
    removeAlbum,
    removeAlbumsBulk,
    removeArtistsBulk,
    resolveAlbumCoverUrl,
    saveLocalLibrary,
    toThumbnailUrl,
    updateAlbum,
    updateArtist,
    upsertArtist,
    type AlbumDraft,
    type LocalAlbum,
    type LocalArtist,
    type LocalLibraryState,
} from "@/lib/local/library-store"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"

/** 根页 = 艺人/专辑；artist = 艺人下专辑；album = 某专辑曲目；all = 全部歌曲 */
export type LocalNav =
    | { kind: "root" }
    | { kind: "artist"; artistId: string }
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

    const selectedArtist: LocalArtist | null = useMemo(() => {
        if (nav.kind !== "artist") {
            return null
        }
        return library.artists.find((artist) => artist.id === nav.artistId) ?? null
    }, [library.artists, nav])

    const artistAlbums: LocalAlbum[] = useMemo(
        () =>
            nav.kind === "artist"
                ? listAlbumsByArtist(library, nav.artistId)
                : [],
        [library, nav],
    )

    const tracks: Track[] = useMemo(() => {
        if (nav.kind === "album") {
            return listTracksByAlbum(library, nav.albumId)
        }
        if (nav.kind === "all") {
            return allTracks
        }
        return []
    }, [allTracks, library, nav])

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desktop])

    // 旧 base64 封面迁移到文件缓存（一次性）：base64 在 localStorage 与图片解码都吃内存
    useEffect(() => {
        if (!desktop) {
            return
        }
        let cancelled = false
        const pending: { kind: "album" | "artist"; id: string; cover: string }[] = []
        for (const album of library.albums) {
            if (album.coverDataUrl.startsWith("data:")) {
                pending.push({ kind: "album", id: album.id, cover: album.coverDataUrl })
            }
        }
        for (const artist of library.artists) {
            if (artist.coverDataUrl.startsWith("data:")) {
                pending.push({ kind: "artist", id: artist.id, cover: artist.coverDataUrl })
            }
        }
        if (pending.length === 0) {
            return
        }
        void (async () => {
            const { coverPathToUrl, migrateLegacyCover } = await import(
                "@/lib/local/cover"
            )
            let changed = false
            const next = { ...library }
            for (const item of pending) {
                if (cancelled) {
                    return
                }
                try {
                    const cached = await migrateLegacyCover(item.cover)
                    const asset = coverPathToUrl(cached.originalPath)
                    if (!asset) {
                        continue
                    }
                    changed = true
                    if (item.kind === "album") {
                        next.albums = next.albums.map((album) =>
                            album.id === item.id
                                ? { ...album, coverDataUrl: asset }
                                : album,
                        )
                    } else {
                        next.artists = next.artists.map((artist) =>
                            artist.id === item.id
                                ? { ...artist, coverDataUrl: asset }
                                : artist,
                        )
                    }
                } catch {
                    // 迁移失败保留旧 base64，下次启动再试
                }
            }
            if (cancelled || !changed) {
                return
            }
            saveLocalLibrary(next)
            setLibrary(next)
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desktop])

    // Rust 扫描进度事件订阅
    useEffect(() => {
        if (!desktop) {
            return
        }
        let unlisten: (() => void) | undefined
        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen<{ done: number; total: number; currentPath: string }>(
                "musicstorm:scan-progress",
                (event) => {
                    const { done, total, currentPath } = event.payload
                    const fileName =
                        currentPath.split(/[\\/]/).filter(Boolean).pop() ?? ""
                    setStatusText(
                        `正在扫描… ${done}/${total}${fileName ? ` · ${fileName}` : ""}`,
                    )
                },
            ).then((dispose) => {
                unlisten = dispose
            })
        })
        return () => {
            unlisten?.()
        }
    }, [desktop])

    const goRoot = useCallback(() => setNav({ kind: "root" }), [])
    const openAlbum = useCallback((albumId: string) => {
        setNav({ kind: "album", albumId })
    }, [])
    const openArtist = useCallback((artistId: string) => {
        setNav({ kind: "artist", artistId })
    }, [])
    const openAllSongs = useCallback(() => setNav({ kind: "all" }), [])

    /** 导入艺人文件夹：子文件夹自动成专辑，根目录散曲进「精选」 */
    const importArtistFolder = useCallback(async () => {
        if (!desktop) {
            notifyError("仅桌面可用", { description: "浏览器预览无法选择目录" })
            return
        }
        try {
            const folderPath = await pickMusicFolder()
            if (!folderPath) {
                return
            }
            setSubmitting(true)
            setStatusText("正在扫描艺人文件夹…")
            const result = await commitArtistFolder({ folderPath })
            setLibrary(result.state)
            setNav({ kind: "artist", artistId: result.artist.id })
            const msg =
                result.added > 0
                    ? `已导入 ${result.added} 首 · ${result.artist.name}`
                    : `未发现新音频（可能已导入过） · ${result.artist.name}`
            setStatusText(msg)
            notifySuccess(result.added > 0 ? "艺人导入完成" : "扫描完成", {
                description: msg,
            })
        } catch (error) {
            if (error instanceof Error && error.message === "CANCELLED") {
                return
            }
            notifyError("艺人导入失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
            setStatusText(null)
        } finally {
            setSubmitting(false)
        }
    }, [desktop])

    const createArtist = useCallback(
        (draft: { name: string; coverDataUrl?: string }) => {
            const { state, artist } = upsertArtist(loadLocalLibrary(), {
                name: draft.name,
                folderPath: null,
                coverDataUrl: draft.coverDataUrl ?? "",
            })
            setLibrary(state)
            setNav({ kind: "artist", artistId: artist.id })
            setStatusText(`已创建艺人 · ${artist.name}`)
            notifySuccess("艺人已创建", { description: artist.name })
        },
        [],
    )

    const editArtist = useCallback(
        (artistId: string, patch: { name: string; coverDataUrl?: string }) => {
            const next = updateArtist(library, artistId, {
                name: patch.name,
                coverDataUrl: patch.coverDataUrl,
            })
            setLibrary(next)
            setStatusText(`已更新 · ${patch.name}`)
            notifySuccess("艺人已更新", { description: patch.name })
        },
        [library],
    )

    const deleteArtist = useCallback(
        (artist: LocalArtist, includeAlbums = false) => {
            const next = removeArtistsBulk(library, new Set([artist.id]), includeAlbums)
            setLibrary(next)
            setNav({ kind: "root" })
            setStatusText(
                includeAlbums
                    ? `已移除艺人及专辑 · ${artist.name}`
                    : `已移除艺人 ${artist.name}`,
            )
            notifySuccess("已移除艺人", {
                description: includeAlbums
                    ? `${artist.name} 及其专辑已移除（磁盘文件保留）`
                    : `${artist.name} 分组已移除，专辑保留`,
            })
        },
        [library],
    )

    const deleteAlbums = useCallback(
        (albumIds: string[]) => {
            if (albumIds.length === 0) {
                return
            }
            const next = removeAlbumsBulk(library, new Set(albumIds))
            setLibrary(next)
            if (nav.kind === "album" && albumIds.includes(nav.albumId)) {
                setNav({ kind: "root" })
            }
            setStatusText(`已移除 ${albumIds.length} 张专辑`)
            notifySuccess("批量移除完成", {
                description: `${albumIds.length} 张专辑及其曲目索引已移除（磁盘文件保留）`,
            })
        },
        [library, nav],
    )

    /** 批量删除艺人；includeAlbums 时连同其下专辑 */
    const deleteArtists = useCallback(
        (artistIds: string[], includeAlbums: boolean) => {
            if (artistIds.length === 0) {
                return
            }
            const next = removeArtistsBulk(library, new Set(artistIds), includeAlbums)
            setLibrary(next)
            setNav({ kind: "root" })
            setStatusText(
                `已移除 ${artistIds.length} 位艺人${includeAlbums ? "及专辑" : ""}`,
            )
            notifySuccess("批量移除完成", {
                description: includeAlbums
                    ? `${artistIds.length} 位艺人及其专辑已移除（磁盘文件保留）`
                    : `${artistIds.length} 位艺人分组已移除，专辑保留`,
            })
        },
        [library],
    )

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
                    : `未发现新音频（可能已导入过） · ${result.album.title}`
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
                        : "没有新增曲目（重复选择或非音频文件）"
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

    /** 列表卡片封面：走 192px 缩略图，降低图片解码内存 */
    const albumCoverThumb = useCallback(
        (album: LocalAlbum) => toThumbnailUrl(resolveAlbumCoverUrl(album, library)),
        [library],
    )

    const subtitle =
        statusText ??
        (library.albums.length > 0
            ? `${library.artists.length > 0 ? `${library.artists.length} 位艺人 · ` : ""}${library.albums.length} 张专辑 · ${allTracks.length} 首`
            : desktop
              ? "导入本机音乐文件"
              : "请使用桌面应用导入")

    return {
        desktop,
        library,
        nav,
        selectedAlbum,
        selectedArtist,
        artistAlbums,
        tracks,
        allTracks,
        submitting,
        subtitle,
        goRoot,
        openAlbum,
        openArtist,
        openAllSongs,
        importArtistFolder,
        importFolder,
        importTracks,
        createAlbum,
        createArtist,
        editAlbum,
        editArtist,
        rescanAlbum,
        deleteAlbum,
        deleteAlbums,
        deleteArtist,
        deleteArtists,
        clearAll,
        albumCover,
        albumCoverThumb,
    }
}

export { useLocalLibrary }