import { lazy, Suspense, useCallback, useEffect, useState } from "react"

import { AppShell } from "@/components/app/app-shell"
import { ThemeProvider } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { Toaster, toast } from "@/components/ui/toast"
import { AppUpdateProvider } from "@/hooks/use-app-update"
import { useApiCacheAutoPurge } from "@/hooks/use-api-cache-auto-purge"
import { bootIntegratedApiProbe } from "@/lib/app/integrated-api-boot"
import { useDevtoolsShortcut } from "@/lib/app/devtools-prefs"
import { isWebMode } from "@/lib/web-mode"
import {
    PERFORMANCE_MODE_EVENT,
    applyPerformanceModeClass,
    getPerformanceMode,
} from "@/lib/app/performance-prefs"
import {
    readTitleBarStyle,
    TITLE_BAR_STORAGE_KEY,
    type SettingsTab,
} from "@/lib/app/title-bar-prefs"
import { migrateLegacyOverrides } from "@/lib/music/cover-overrides"
import {
    MusicNavigationProvider,
    useMusicNavigation,
} from "@/hooks/use-music-navigation"
import { NeteaseSessionProvider } from "@/hooks/use-netease-session"
import { LikedProvider } from "@/hooks/use-liked"
import { PlayerProvider } from "@/hooks/use-player"
import type { AppRoute } from "@/lib/routes"
import { HomePage } from "@/pages/home"
import {
    AlbumDetailSkeleton,
    ArtistDetailSkeleton,
    LocalPageSkeleton,
    MvDetailSkeleton,
    PlaylistDetailSkeleton,
    PlaylistGridSkeleton,
    RadioDetailSkeleton,
    RadioProgramDetailSkeleton,
    RadiosPageSkeleton,
    SearchResultsSkeleton,
    SettingsPageSkeleton,
    StatsPageSkeleton,
} from "@/components/music/loading-skeletons"

const SettingsPage = lazy(() => import("@/pages/settings").then(m => ({ default: m.SettingsPage })))
const AlbumPage = lazy(() => import("@/pages/album").then(m => ({ default: m.AlbumPage })))
const ArtistPage = lazy(() => import("@/pages/artist").then(m => ({ default: m.ArtistPage })))
const LibraryPage = lazy(() => import("@/pages/library").then(m => ({ default: m.LibraryPage })))
const LocalPage = lazy(() => import("@/pages/local").then(m => ({ default: m.LocalPage })))
const LocalWebPage = lazy(() => import("@/pages/local-web").then(m => ({ default: m.LocalWebPage })))
const MvPage = lazy(() => import("@/pages/mv").then(m => ({ default: m.MvPage })))
const PlaylistPage = lazy(() => import("@/pages/playlist").then(m => ({ default: m.PlaylistPage })))
const RadioPage = lazy(() => import("@/pages/radio").then(m => ({ default: m.RadioPage })))
const RadioProgramPage = lazy(() => import("@/pages/radio-program").then(m => ({ default: m.RadioProgramPage })))
const RadiosPage = lazy(() => import("@/pages/radios").then(m => ({ default: m.RadiosPage })))
const SearchPage = lazy(() => import("@/pages/search").then(m => ({ default: m.SearchPage })))
const StatsPage = lazy(() => import("@/pages/stats").then(m => ({ default: m.StatsPage })))

import "./App.css"
import "./Style.css"

function AppRoutes({
    route,
    titleBarStyle,
    onTitleBarStyleChange,
    settingsTab,
}: {
    route: AppRoute
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
    settingsTab?: SettingsTab
}) {
    const { detail, openPlaylist, openRadio, back } = useMusicNavigation()

    const playlistFallback = <PlaylistDetailSkeleton />
    const albumFallback = <AlbumDetailSkeleton />
    const artistFallback = <ArtistDetailSkeleton />
    const radioFallback = <RadioDetailSkeleton />
    const programFallback = <RadioProgramDetailSkeleton />
    const mvFallback = <MvDetailSkeleton />
    const gridFallback = <PlaylistGridSkeleton count={5} />

    if (detail?.type === "playlist") {
        return <Suspense fallback={playlistFallback}><PlaylistPage playlistId={detail.id} onBack={back} /></Suspense>
    }
    if (detail?.type === "artist") {
        return <Suspense fallback={artistFallback}><ArtistPage artistId={detail.id} onBack={back} /></Suspense>
    }
    if (detail?.type === "album") {
        return <Suspense fallback={albumFallback}><AlbumPage albumId={detail.id} onBack={back} /></Suspense>
    }
    if (detail?.type === "radio") {
        return <Suspense fallback={radioFallback}><RadioPage radioId={detail.id} onBack={back} /></Suspense>
    }
    if (detail?.type === "radio-program") {
        return (
            <Suspense fallback={programFallback}>
                <RadioProgramPage
                    programId={detail.id}
                    radioId={detail.radioId}
                    onBack={back}
                />
            </Suspense>
        )
    }
    if (detail?.type === "mv") {
        return <Suspense fallback={mvFallback}><MvPage mvId={detail.id} onBack={back} /></Suspense>
    }

    if (route === "home") {
        return (
            <HomePage onOpenPlaylist={openPlaylist} onOpenRadio={openRadio} />
        )
    }
    if (route === "local") {
        // 网页版无文件系统访问：轻量导入页（blob URL 播放，不落盘）
        if (isWebMode()) {
            return (
                <Suspense fallback={<LocalPageSkeleton />}>
                    <LocalWebPage />
                </Suspense>
            )
        }
        return <Suspense fallback={<LocalPageSkeleton />}><LocalPage /></Suspense>
    }
    if (route === "library") {
        return <Suspense fallback={gridFallback}><LibraryPage /></Suspense>
    }
    if (route === "radios") {
        return <Suspense fallback={<RadiosPageSkeleton />}><RadiosPage /></Suspense>
    }
    if (route === "search") {
        return <Suspense fallback={<SearchResultsSkeleton />}><SearchPage /></Suspense>
    }
    if (route === "stats") {
        return <Suspense fallback={<StatsPageSkeleton />}><StatsPage /></Suspense>
    }
    if (route === "settings") {
        return (
            <Suspense fallback={<SettingsPageSkeleton />}>
                <SettingsPage
                    titleBarStyle={titleBarStyle}
                    onTitleBarStyleChange={onTitleBarStyleChange}
                    initialTab={settingsTab}
                />
            </Suspense>
        )
    }
    return null
}

function App() {
    const [route, setRoute] = useState<AppRoute>(() =>
        isWebMode() ? webHashToRoute(window.location.hash) : "home",
    )
    const [titleBarStyle, setTitleBarStyle] = useState<TitleBarStyle>(() =>
        readTitleBarStyle(),
    )
    const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>()

    useApiCacheAutoPurge()
    useDevtoolsShortcut()

    useEffect(() => {
        document.getElementById("boot-loading")?.remove()
    }, [])

    useEffect(() => {
        applyPerformanceModeClass(getPerformanceMode())
        function onMode() {
            applyPerformanceModeClass(getPerformanceMode())
        }
        window.addEventListener(PERFORMANCE_MODE_EVENT, onMode)
        return () =>
            window.removeEventListener(PERFORMANCE_MODE_EVENT, onMode)
    }, [])

    // 禁用 WebView2 原生右键菜单：应用内自定义菜单接管；
    // 文本输入区（歌词编辑等）保留原生复制/粘贴菜单
    useEffect(() => {
        function handleContextMenu(event: globalThis.MouseEvent) {
            const target = event.target as HTMLElement | null
            if (
                target &&
                target.closest("input, textarea, [contenteditable='true']")
            ) {
                return
            }
            event.preventDefault()
        }
        document.addEventListener("contextmenu", handleContextMenu)
        return () =>
            document.removeEventListener("contextmenu", handleContextMenu)
    }, [])

    const handleTitleBarStyleChange = useCallback((style: TitleBarStyle) => {
        setTitleBarStyle(style)
        window.localStorage.setItem(TITLE_BAR_STORAGE_KEY, style)
    }, [])

    return (
        <ThemeProvider>
            <Toaster toastManager={toast}>
                <AppUpdateProvider>
                    <IntegratedApiBootEffect />
                    <NeteaseSessionProvider>
                        <LikedProvider>
                            <PlayerProvider>
                                <MusicNavigationProvider>
                                    <AppWithNav
                                        route={route}
                                        setRoute={setRoute}
                                        titleBarStyle={titleBarStyle}
                                        onTitleBarStyleChange={
                                            handleTitleBarStyleChange
                                        }
                                        settingsTab={settingsTab}
                                        setSettingsTab={setSettingsTab}
                                    />
                                </MusicNavigationProvider>
                            </PlayerProvider>
                        </LikedProvider>
                    </NeteaseSessionProvider>
                </AppUpdateProvider>
            </Toaster>
        </ThemeProvider>
    )
}

/** 挂在 Toaster 内，保证失败 toast；同时静默迁移旧 base64 封面。
 *  冷启动优化：延迟非关键操作到首屏渲染完成后执行。 */
function IntegratedApiBootEffect() {    useEffect(() => {
        // API 探测和旧数据迁移延迟到首帧之后，避免阻塞冷启动关键路径
        const timer = window.setTimeout(() => {
            void bootIntegratedApiProbe()
            void migrateLegacyOverrides()
        }, 2_500)
        return () => window.clearTimeout(timer)
    }, [])
    return null
}

// 网页版 hash 路由：/#/player 为默认播放页，其余路由与侧栏一致。
// 未知或空 hash 回落到主页，避免链接拼错导致白屏。
const WEB_HASH_ROUTES: Record<string, AppRoute> = {
    player: "home",
    local: "local",
    library: "library",
    radios: "radios",
    search: "search",
    stats: "stats",
    settings: "settings",
}

function webHashToRoute(hash: string): AppRoute {
    const key = hash.replace(/^#\/?/, "").split("?")[0].toLowerCase()
    return WEB_HASH_ROUTES[key] ?? "home"
}

function webRouteToHash(route: AppRoute): string {
    const key = Object.entries(WEB_HASH_ROUTES).find(
        ([, value]) => value === route,
    )?.[0]
    return `#/${key ?? "player"}`
}

function AppWithNav({
    route,
    setRoute,
    titleBarStyle,
    onTitleBarStyleChange,
    settingsTab,
    setSettingsTab,
}: {
    route: AppRoute
    setRoute: (route: AppRoute) => void
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
    settingsTab?: SettingsTab
    setSettingsTab: (tab: SettingsTab | undefined) => void
}) {
    const { closeDetail } = useMusicNavigation()

    const handleNavigate = useCallback(
        (next: AppRoute) => {
            closeDetail()
            if (next !== "settings") {
                setSettingsTab(undefined)
            }
            setRoute(next)
        },
        [closeDetail, setRoute, setSettingsTab],
    )

    const handleOpenUpdate = useCallback(() => {
        closeDetail()
        setSettingsTab("update")
        setRoute("settings")
    }, [closeDetail, setRoute, setSettingsTab])

    // 网页版与浏览器地址栏同步：/#/player 进入应用，#/local 等映射路由。
    // 桌面版保持纯内存路由，不受 hash 影响。
    useEffect(() => {
        if (!isWebMode()) {
            return
        }
        function sync() {
            const next = webHashToRoute(window.location.hash)
            setRoute(next)
        }
        window.addEventListener("hashchange", sync)
        return () => window.removeEventListener("hashchange", sync)
    }, [])

    // 导航时同步 hash（网页版可分享/刷新保持页面；触发 hashchange 后 setRoute 幂等）
    const handleNavigateWeb = useCallback(
        (next: AppRoute) => {
            if (isWebMode()) {
                const target = webRouteToHash(next)
                if (window.location.hash !== target) {
                    window.location.hash = target
                }
            }
            handleNavigate(next)
        },
        [handleNavigate],
    )

    useEffect(() => {
        // 网页版没有 Tauri 运行时，listen 内部会访问 window.__TAURI_INTERNALS__ 崩溃
        if (isWebMode()) {
            return
        }
        let unlisten: (() => void) | null = null
        let cancelled = false
        void import("@tauri-apps/api/event").then(({ listen }) => {
            if (cancelled) {
                return
            }
            void listen("musicstorm:open-settings", () => {
                handleNavigate("settings")
            }).then((stop) => {
                if (cancelled) {
                    stop()
                } else {
                    unlisten = stop
                }
            })
        })
        return () => {
            cancelled = true
            unlisten?.()
        }
    }, [handleNavigate])

    return (
        <AppShell
            activeRoute={route}
            onNavigate={handleNavigateWeb}
            titleBarStyle={titleBarStyle}
            onOpenUpdate={handleOpenUpdate}
        >
            <AppRoutes
                route={route}
                titleBarStyle={titleBarStyle}
                onTitleBarStyleChange={onTitleBarStyleChange}
                settingsTab={settingsTab}
            />
        </AppShell>
    )
}

export default App
