import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react"

import { useNeteaseSession } from "@/hooks/use-netease-session"
import { fetchAlbumSublist, subscribeAlbum } from "@/lib/netease/album"
import { fetchDjSublist, subscribeDjRadio } from "@/lib/netease/dj"
import { fetchLikelist, setTrackLiked } from "@/lib/netease/like"
import { subscribePlaylist } from "@/lib/netease/playlist"
import { fetchUserPlaylistsDetailed } from "@/lib/netease/user"
import {
    formatError,
    notifyError,
    notifyFromError,
    notifySuccess,
} from "@/lib/notify"

type LikedContextValue = {
    ready: boolean
    likedSongIds: ReadonlySet<string>
    likedSongPlaylistId: string | null
    subscribedPlaylistIds: ReadonlySet<string>
    subscribedRadioIds: ReadonlySet<string>
    subscribedAlbumIds: ReadonlySet<string>
    isTrackLiked: (trackId: string) => boolean
    isPlaylistSubscribed: (playlistId: string) => boolean
    isRadioSubscribed: (radioId: string) => boolean
    isAlbumSubscribed: (albumId: string) => boolean
    toggleTrackLiked: (trackId: string) => Promise<boolean>
    togglePlaylistSubscribed: (playlistId: string) => Promise<boolean>
    toggleRadioSubscribed: (radioId: string) => Promise<boolean>
    toggleAlbumSubscribed: (albumId: string) => Promise<boolean>
    refresh: () => Promise<void>
}

const LikedContext = createContext<LikedContextValue | null>(null)

function LikedProvider({ children }: { children: ReactNode }) {
    const { ready: sessionReady, loggedIn, profile } = useNeteaseSession()
    const [ready, setReady] = useState(false)
    const [likedSongIds, setLikedSongIds] = useState<Set<string>>(() => new Set())
    const [likedSongPlaylistId, setLikedSongPlaylistId] = useState<string | null>(
        null,
    )
    const [subscribedPlaylistIds, setSubscribedPlaylistIds] = useState<Set<string>>(
        () => new Set(),
    )
    const [subscribedRadioIds, setSubscribedRadioIds] = useState<Set<string>>(
        () => new Set(),
    )
    const [subscribedAlbumIds, setSubscribedAlbumIds] = useState<Set<string>>(
        () => new Set(),
    )

    const clear = useCallback(() => {
        setLikedSongIds(new Set())
        setLikedSongPlaylistId(null)
        setSubscribedPlaylistIds(new Set())
        setSubscribedRadioIds(new Set())
        setSubscribedAlbumIds(new Set())
        setReady(true)
    }, [])

    const applySync = useCallback(
        async (userId: string) => {
            const [ids, playlists, radios, albums] = await Promise.all([
                fetchLikelist(userId),
                fetchUserPlaylistsDetailed(userId),
                fetchDjSublist().catch(() => [] as { id: string }[]),
                fetchAlbumSublist().catch(() => [] as { id: string }[]),
            ])
            setLikedSongIds(new Set(ids))
            setLikedSongPlaylistId(playlists.likedSongPlaylistId)
            setSubscribedPlaylistIds(new Set(playlists.subscribedIds))
            setSubscribedRadioIds(new Set(radios.map((item) => item.id)))
            setSubscribedAlbumIds(new Set(albums.map((item) => item.id)))
        },
        [],
    )

    const refresh = useCallback(async () => {
        if (!loggedIn || !profile) {
            clear()
            return
        }
        try {
            await applySync(profile.userId)
        } catch {
            // 保持旧数据
        } finally {
            setReady(true)
        }
    }, [applySync, clear, loggedIn, profile])

    useEffect(() => {
        if (!sessionReady) {
            return
        }
        if (!loggedIn || !profile?.userId) {
            clear()
            return
        }
        let cancelled = false
        setReady(false)
        void (async () => {
            try {
                await applySync(profile.userId)
            } catch {
                // 保持旧数据
            } finally {
                if (!cancelled) {
                    setReady(true)
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [sessionReady, loggedIn, profile?.userId, clear, profile, applySync])

    const isTrackLiked = useCallback(
        (trackId: string) => likedSongIds.has(trackId),
        [likedSongIds],
    )

    const isPlaylistSubscribed = useCallback(
        (playlistId: string) => subscribedPlaylistIds.has(playlistId),
        [subscribedPlaylistIds],
    )

    const isRadioSubscribed = useCallback(
        (radioId: string) => subscribedRadioIds.has(radioId),
        [subscribedRadioIds],
    )

    const isAlbumSubscribed = useCallback(
        (albumId: string) => subscribedAlbumIds.has(albumId),
        [subscribedAlbumIds],
    )

    const toggleTrackLiked = useCallback(
        async (trackId: string) => {
            if (!loggedIn) {
                return false
            }
            const next = !likedSongIds.has(trackId)
            setLikedSongIds((prev) => {
                const copy = new Set(prev)
                if (next) {
                    copy.add(trackId)
                } else {
                    copy.delete(trackId)
                }
                return copy
            })
            try {
                await setTrackLiked(trackId, next)
                notifySuccess(next ? "已加入喜欢" : "已取消喜欢")
                return next
            } catch (error) {
                setLikedSongIds((prev) => {
                    const copy = new Set(prev)
                    if (next) {
                        copy.delete(trackId)
                    } else {
                        copy.add(trackId)
                    }
                    return copy
                })
                const message = formatError(error) || "红心操作失败"
                notifyError("喜欢失败", { description: message })
                throw new Error(message)
            }
        },
        [likedSongIds, loggedIn],
    )

    const togglePlaylistSubscribed = useCallback(
        async (playlistId: string) => {
            if (!loggedIn) {
                return false
            }
            if (playlistId === likedSongPlaylistId) {
                return true
            }
            const next = !subscribedPlaylistIds.has(playlistId)
            setSubscribedPlaylistIds((prev) => {
                const copy = new Set(prev)
                if (next) {
                    copy.add(playlistId)
                } else {
                    copy.delete(playlistId)
                }
                return copy
            })
            try {
                await subscribePlaylist(playlistId, next)
                notifySuccess(next ? "已收藏歌单" : "已取消收藏")
                return next
            } catch (error) {
                setSubscribedPlaylistIds((prev) => {
                    const copy = new Set(prev)
                    if (next) {
                        copy.delete(playlistId)
                    } else {
                        copy.add(playlistId)
                    }
                    return copy
                })
                notifyFromError("歌单收藏失败", error)
                throw new Error(formatError(error) || "歌单收藏失败")
            }
        },
        [likedSongPlaylistId, loggedIn, subscribedPlaylistIds],
    )

    const toggleRadioSubscribed = useCallback(
        async (radioId: string) => {
            if (!loggedIn) {
                return false
            }
            const next = !subscribedRadioIds.has(radioId)
            setSubscribedRadioIds((prev) => {
                const copy = new Set(prev)
                if (next) {
                    copy.add(radioId)
                } else {
                    copy.delete(radioId)
                }
                return copy
            })
            try {
                await subscribeDjRadio(radioId, next)
                notifySuccess(next ? "已订阅电台" : "已取消订阅")
                return next
            } catch (error) {
                setSubscribedRadioIds((prev) => {
                    const copy = new Set(prev)
                    if (next) {
                        copy.delete(radioId)
                    } else {
                        copy.add(radioId)
                    }
                    return copy
                })
                notifyFromError("电台订阅失败", error)
                throw new Error(formatError(error) || "电台订阅失败")
            }
        },
        [loggedIn, subscribedRadioIds],
    )

    const toggleAlbumSubscribed = useCallback(
        async (albumId: string) => {
            if (!loggedIn) {
                return false
            }
            const next = !subscribedAlbumIds.has(albumId)
            setSubscribedAlbumIds((prev) => {
                const copy = new Set(prev)
                if (next) {
                    copy.add(albumId)
                } else {
                    copy.delete(albumId)
                }
                return copy
            })
            try {
                await subscribeAlbum(albumId, next)
                notifySuccess(next ? "已收藏专辑" : "已取消收藏")
                return next
            } catch (error) {
                setSubscribedAlbumIds((prev) => {
                    const copy = new Set(prev)
                    if (next) {
                        copy.delete(albumId)
                    } else {
                        copy.add(albumId)
                    }
                    return copy
                })
                notifyFromError("专辑收藏失败", error)
                throw new Error(formatError(error) || "专辑收藏失败")
            }
        },
        [loggedIn, subscribedAlbumIds],
    )

    const value = useMemo<LikedContextValue>(
        () => ({
            ready,
            likedSongIds,
            likedSongPlaylistId,
            subscribedPlaylistIds,
            subscribedRadioIds,
            subscribedAlbumIds,
            isTrackLiked,
            isPlaylistSubscribed,
            isRadioSubscribed,
            isAlbumSubscribed,
            toggleTrackLiked,
            togglePlaylistSubscribed,
            toggleRadioSubscribed,
            toggleAlbumSubscribed,
            refresh,
        }),
        [
            ready,
            likedSongIds,
            likedSongPlaylistId,
            subscribedPlaylistIds,
            subscribedRadioIds,
            subscribedAlbumIds,
            isTrackLiked,
            isPlaylistSubscribed,
            isRadioSubscribed,
            isAlbumSubscribed,
            toggleTrackLiked,
            togglePlaylistSubscribed,
            toggleRadioSubscribed,
            toggleAlbumSubscribed,
            refresh,
        ],
    )

    return <LikedContext.Provider value={value}>{children}</LikedContext.Provider>
}

function useLiked(): LikedContextValue {
    const ctx = useContext(LikedContext)
    if (!ctx) {
        throw new Error("useLiked must be used within LikedProvider")
    }
    return ctx
}

export { LikedProvider, useLiked }