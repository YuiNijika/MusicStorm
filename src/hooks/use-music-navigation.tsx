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
    openRadioProgram: (programId: string, radioId?: string) => void
    openMv: (id: string) => void
    /** 歌曲评论页 */
    openComments: (target: {
        id: string
        title?: string
        subtitle?: string
    }) => void
    /** 返回上一层；无更多历史时关闭详情 */
    back: () => void
    /** 清空详情栈，侧栏切页时用 */
    closeDetail: () => void
}

const MusicNavigationContext = createContext<MusicNavigationValue | null>(null)

function sameDetail(a: MusicDetail, b: MusicDetail): boolean {
    if (a.type !== b.type || a.id !== b.id) {
        return false
    }
    if (a.type === "radio-program" && b.type === "radio-program") {
        return (a.radioId ?? "") === (b.radioId ?? "")
    }
    return true
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

    const openRadioProgram = useCallback(
        (programId: string, radioId?: string) => {
            const next = programId.trim()
            if (!next || !/^\d+$/.test(next)) {
                return
            }
            const rid = radioId?.trim()
            pushDetail({
                type: "radio-program",
                id: next,
                ...(rid && /^\d+$/.test(rid) ? { radioId: rid } : {}),
            })
        },
        [pushDetail],
    )

    const openMv = useCallback(
        (id: string) => {
            const next = id.trim()
            if (!next || !/^\d+$/.test(next)) {
                return
            }
            pushDetail({ type: "mv", id: next })
        },
        [pushDetail],
    )

    const openComments = useCallback(
        (target: { id: string; title?: string; subtitle?: string }) => {
            const next = target.id.trim()
            if (!next || !/^\d+$/.test(next)) {
                return
            }
            const detail: MusicDetail = {
                type: "comments",
                id: next,
                ...(target.title ? { title: target.title } : {}),
                ...(target.subtitle ? { subtitle: target.subtitle } : {}),
            }
            pushDetail(detail)
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
            openRadioProgram,
            openMv,
            openComments,
            back,
            closeDetail,
        }),
        [
            detail,
            openPlaylist,
            openArtist,
            openAlbum,
            openRadio,
            openRadioProgram,
            openMv,
            openComments,
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