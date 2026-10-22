import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react"

import {
    applyFrontendModeToDom,
    getWorkspaceModule,
    normalizeLayout,
    readFrontendMode,
    readWorkspaceLayouts,
    writeFrontendMode,
    writeWorkspaceLayouts,
    type FrontendMode,
    type WorkspaceLayoutItem,
    type WorkspaceLayouts,
    type WorkspaceModule,
    type WorkspaceModuleId,
} from "@/lib/frontend-mode"

type FrontendModeContextValue = {
    mode: FrontendMode
    layouts: WorkspaceLayouts
    layoutItems: WorkspaceLayoutItem[]
    visibleModules: WorkspaceModule[]
    setMode: (mode: FrontendMode) => void
    reorderModules: (next: WorkspaceLayoutItem[]) => void
    setModuleVisible: (id: WorkspaceModuleId, visible: boolean) => boolean
    resetLayout: () => void
}

const FrontendModeContext = createContext<FrontendModeContextValue | null>(
    null,
)

export function FrontendModeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<FrontendMode>(() =>
        readFrontendMode(),
    )
    const [layouts, setLayouts] = useState<WorkspaceLayouts>(() =>
        readWorkspaceLayouts(),
    )

    useEffect(() => {
        applyFrontendModeToDom(mode)
    }, [mode])

    const setMode = useCallback((next: FrontendMode) => {
        applyFrontendModeToDom(next)
        writeFrontendMode(next)
        setModeState(next)
    }, [])

    const commitLayout = useCallback(
        (nextLayout: WorkspaceLayoutItem[]) => {
            setLayouts((current) => {
                const next = {
                    ...current,
                    [mode]: normalizeLayout(mode, nextLayout),
                }
                writeWorkspaceLayouts(next)
                return next
            })
        },
        [mode],
    )

    const reorderModules = useCallback(
        (next: WorkspaceLayoutItem[]) => {
            commitLayout(next)
        },
        [commitLayout],
    )

    const setModuleVisible = useCallback(
        (id: WorkspaceModuleId, visible: boolean): boolean => {
            const currentLayout = layouts[mode]
            if (
                !visible &&
                currentLayout.filter((item) => item.visible).length <= 1
            ) {
                return false
            }
            commitLayout(
                currentLayout.map((item) =>
                    item.id === id ? { ...item, visible } : item,
                ),
            )
            return true
        },
        [commitLayout, layouts, mode],
    )

    const resetLayout = useCallback(() => {
        commitLayout(normalizeLayout(mode, null))
    }, [commitLayout, mode])

    const layoutItems = layouts[mode]
    const visibleModules = useMemo(
        () =>
            layoutItems
                .filter((item) => item.visible)
                .map((item) => getWorkspaceModule(mode, item.id))
                .filter((item): item is WorkspaceModule => item != null),
        [layoutItems, mode],
    )

    const value = useMemo(
        () => ({
            mode,
            layouts,
            layoutItems,
            visibleModules,
            setMode,
            reorderModules,
            setModuleVisible,
            resetLayout,
        }),
        [
            layouts,
            layoutItems,
            mode,
            resetLayout,
            reorderModules,
            setMode,
            setModuleVisible,
            visibleModules,
        ],
    )

    return (
        <FrontendModeContext.Provider value={value}>
            {children}
        </FrontendModeContext.Provider>
    )
}

export function useFrontendMode(): FrontendModeContextValue {
    const context = useContext(FrontendModeContext)
    if (!context) {
        throw new Error("useFrontendMode must be used within FrontendModeProvider")
    }
    return context
}
