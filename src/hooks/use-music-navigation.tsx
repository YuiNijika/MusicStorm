import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react"

import type { MusicDetail } from "@/lib/routes"

type MusicNavigationValue = {
    /** 当前栈顶详情；无详情为 null */
    detail: MusicDetail | null
    openPlaylist: (id: string) => void
    openArtist: (id: string) => void
    openAlbum: (id: string) => void
    openRadio: (id: string) => void
    /** 返回上一层；栈空则关闭详情 */
    back: () => void
    /** 清空详情栈（侧栏切页时用） */
    closeDetail: () => void
}

const MusicNavigationContext = createContext<MusicNavigationValue | null>(null)

function sameDetail(a: MusicDetail, b: MusicDetail): boolean {
    return a.type === b.type && a.id === b.id
}

function MusicNavigationProvider({ children }: { children: ReactNode }) {
    const [stack, setStack] = useState<MusicDetail[]>([])

    const pushDetail = useCallback((next: MusicDetail) => {
        setStack((prev) => {
            const top = prev[prev.length - 1]
            if (top && sameDetail(top, next)) {
                return prev
            }
            return [...prev, next]
        })
    }, [])

    const openPlaylist = useCallback(
        (id: string) => {
            const next = id.trim()
            if (!next) {
                return
            }
            pushDetail({ type: "playlist", id: next })
        },
        [pushDetail],
    )

    const openArtist = useCallback(
        (id: string) => {
            const next = id.trim()
            if (!next || !/^\d+$/.test(next)) {
                return
            }
            pushDetail({ type: "artist", id: next })
        },
        [pushDetail],
    )

    const openAlbum = useCallback(
        (id: string) => {
            const next = id.trim()
            if (!next || !/^\d+$/.test(next)) {
                return
            }
            pushDetail({ type: "album", id: next })
        },
        [pushDetail],
    )

    const openRadio = useCallback(
        (id: string) => {
            const next = id.trim()
            if (!next || !/^\d+$/.test(next)) {
                return
            }
            pushDetail({ type: "radio", id: next })
        },
        [pushDetail],
    )

    const back = useCallback(() => {
        setStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)))
    }, [])

    const closeDetail = useCallback(() => {
        setStack([])
    }, [])

    const detail = stack.length > 0 ? stack[stack.length - 1]! : null

    const value = useMemo(
        () => ({
            detail,
            openPlaylist,
            openArtist,
            openAlbum,
            openRadio,
            back,
            closeDetail,
        }),
        [
            detail,
            openPlaylist,
            openArtist,
            openAlbum,
            openRadio,
            back,
            closeDetail,
        ],
    )

    return (
        <MusicNavigationContext.Provider value={value}>
            {children}
        </MusicNavigationContext.Provider>
    )
}

function useMusicNavigation(): MusicNavigationValue {
    const ctx = useContext(MusicNavigationContext)
    if (!ctx) {
        throw new Error("useMusicNavigation must be used within MusicNavigationProvider")
    }
    return ctx
}

export { MusicNavigationProvider, useMusicNavigation }