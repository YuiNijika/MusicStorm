import { useCallback, useEffect, useState, type RefCallback } from "react"

/**
 * 按「内容区」宽度定列数，避免用 window + xl：
 * 侧栏占宽后 viewport 已是 xl，主内容仍偏窄。
 *
 * 大屏 6 · 中屏 4–5 · 更小 3
 */
const COL_6_MIN = 1100
const COL_5_MIN = 980
const COL_4_MIN = 700

const PLAYLIST_GRID_CLASS = "grid gap-3"

const PLAYLIST_FETCH_MAX = 48

type PlaylistGridState = {
    cols: number
    /** 骨架占位数量：约两行 */
    count: number
    gridClass: string
    gridStyle: { gridTemplateColumns: string }
    /** 挂到网格/测宽容器上，用 ResizeObserver 测内容宽 */
    gridRef: RefCallback<HTMLElement>
}

function colsFromWidth(width: number): number {
    if (width >= COL_6_MIN) {
        return 6
    }
    if (width >= COL_5_MIN) {
        return 5
    }
    if (width >= COL_4_MIN) {
        return 4
    }
    return 3
}

function buildState(cols: number): Omit<PlaylistGridState, "gridRef"> {
    return {
        cols,
        count: cols * 2,
        gridClass: PLAYLIST_GRID_CLASS,
        gridStyle: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` },
    }
}

function usePlaylistGrid(): PlaylistGridState {
    const [cols, setCols] = useState(() => {
        if (typeof window === "undefined") {
            return 4
        }
        // 首帧近似：减去侧栏约 240，避免误用整窗 xl
        return colsFromWidth(Math.max(0, window.innerWidth - 240))
    })
    const [node, setNode] = useState<HTMLElement | null>(null)

    const gridRef = useCallback<RefCallback<HTMLElement>>((el) => {
        setNode(el)
    }, [])

    useEffect(() => {
        if (!node) {
            return
        }

        function apply(width: number) {
            setCols(colsFromWidth(width))
        }

        apply(node.getBoundingClientRect().width)

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (!entry) {
                return
            }
            apply(entry.contentRect.width)
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [node])

    return {
        ...buildState(cols),
        gridRef,
    }
}

export {
    PLAYLIST_FETCH_MAX,
    PLAYLIST_GRID_CLASS,
    colsFromWidth,
    usePlaylistGrid,
}
export type { PlaylistGridState }