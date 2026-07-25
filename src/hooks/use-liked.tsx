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
    isTrackLiked: (trackId: string) => boolean
    isPlaylistSubscribed: (playlistId: string) => boolean
    toggleTrackLiked: (trackId: string) => Promise<boolean>
    togglePlaylistSubscribed: (playlistId: string) => Promise<boolean>
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

    const clear = useCallback(() => {
        setLikedSongIds(new Set())
        setLikedSongPlaylistId(null)
        setSubscribedPlaylistIds(new Set())
        setReady(true)
    }, [])

    const refresh = useCallback(async () => {
        if (!loggedIn || !profile) {
            clear()
            return
        }
        try {
            const [ids, playlists] = await Promise.all([
                fetchLikelist(profile.userId),
                fetchUserPlaylistsDetailed(profile.userId),
            ])
            setLikedSongIds(new Set(ids))
            setLikedSongPlaylistId(playlists.likedSongPlaylistId)
            setSubscribedPlaylistIds(new Set(playlists.subscribedIds))
        } catch {
            // 保持旧数据，标记 ready 以免 UI 卡死
        } finally {
            setReady(true)
        }
    }, [clear, loggedIn, profile])

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
                const [ids, playlists] = await Promise.all([
                    fetchLikelist(profile.userId),
                    fetchUserPlaylistsDetailed(profile.userId),
                ])
                if (cancelled) {
                    return
                }
                setLikedSongIds(new Set(ids))
                setLikedSongPlaylistId(playlists.likedSongPlaylistId)
                setSubscribedPlaylistIds(new Set(playlists.subscribedIds))
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
    }, [sessionReady, loggedIn, profile?.userId, clear, profile])

    const isTrackLiked = useCallback(
        (trackId: string) => likedSongIds.has(trackId),
        [likedSongIds],
    )

    const isPlaylistSubscribed = useCallback(
        (playlistId: string) => subscribedPlaylistIds.has(playlistId),
        [subscribedPlaylistIds],
    )

    const toggleTrackLiked = useCallback(
        async (trackId: string) => {
            if (!loggedIn) {
                return false
            }
            const next = !likedSongIds.has(trackId)
            // 乐观更新
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
            // 自己的红心歌单不可「取消收藏」
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

    const value = useMemo<LikedContextValue>(
        () => ({
            ready,
            likedSongIds,
            likedSongPlaylistId,
            subscribedPlaylistIds,
            isTrackLiked,
            isPlaylistSubscribed,
            toggleTrackLiked,
            togglePlaylistSubscribed,
            refresh,
        }),
        [
            ready,
            likedSongIds,
            likedSongPlaylistId,
            subscribedPlaylistIds,
            isTrackLiked,
            isPlaylistSubscribed,
            toggleTrackLiked,
            togglePlaylistSubscribed,
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