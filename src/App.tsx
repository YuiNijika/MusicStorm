import { lazy, Suspense, useCallback, useEffect, useState } from "react"

import { AppShell } from "@/components/app/app-shell"
import { ThemeProvider } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { Toaster, toast } from "@/components/ui/toast"
import { AppUpdateProvider } from "@/hooks/use-app-update"
import { useApiCacheAutoPurge } from "@/hooks/use-api-cache-auto-purge"
import { bootIntegratedApiProbe } from "@/lib/app/integrated-api-boot"
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
// 首屏必须的页面保持静态 import，其他页面按需拆分以减小初始 bundle
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

// 非首屏页面 React.lazy 拆分 chunk，冷启动时 V8 只需解析首屏代码
const SettingsPage = lazy(() => import("@/pages/settings").then(m => ({ default: m.SettingsPage })))
const AlbumPage = lazy(() => import("@/pages/album").then(m => ({ default: m.AlbumPage })))
const ArtistPage = lazy(() => import("@/pages/artist").then(m => ({ default: m.ArtistPage })))
const LibraryPage = lazy(() => import("@/pages/library").then(m => ({ default: m.LibraryPage })))
const LocalPage = lazy(() => import("@/pages/local").then(m => ({ default: m.LocalPage })))
const MvPage = lazy(() => import("@/pages/mv").then(m => ({ default: m.MvPage })))
const PlaylistPage = lazy(() => import("@/pages/playlist").then(m => ({ default: m.PlaylistPage })))
const RadioPage = lazy(() => import("@/pages/radio").then(m => ({ default: m.RadioPage })))
const RadioProgramPage = lazy(() => import("@/pages/radio-program").then(m => ({ default: m.RadioProgramPage })))
const RadiosPage = lazy(() => import("@/pages/radios").then(m => ({ default: m.RadiosPage })))
const SearchPage = lazy(() => import("@/pages/search").then(m => ({ default: m.SearchPage })))
const StatsPage = lazy(() => import("@/pages/stats").then(m => ({ default: m.StatsPage })))

import "./App.css"

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

    // 分包加载期间的占位骨架：每个页面按自己的真实布局定制，互不相同
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
    const [route, setRoute] = useState<AppRoute>("home")
    const [titleBarStyle, setTitleBarStyle] = useState<TitleBarStyle>(() =>
        readTitleBarStyle(),
    )
    const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>()

    useApiCacheAutoPurge()

    useEffect(() => {
        // 首帧 DOM 已提交：撤掉内联启动兜底画面
        document.getElementById("boot-loading")?.remove()
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
function IntegratedApiBootEffect() {
    useEffect(() => {
        // API 探测和旧数据迁移延迟到首帧之后，避免阻塞冷启动关键路径
        const timer = window.setTimeout(() => {
            void bootIntegratedApiProbe()
            void migrateLegacyOverrides()
        }, 2_500)
        return () => window.clearTimeout(timer)
    }, [])
    return null
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

    return (
        <AppShell
            activeRoute={route}
            onNavigate={handleNavigate}
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