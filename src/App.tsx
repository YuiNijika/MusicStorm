import { useCallback, useEffect, useState } from "react"

import { AppShell } from "@/components/app/app-shell"
import { ThemeProvider } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { Toaster, toast } from "@/components/ui/toast"
import { AppUpdateProvider } from "@/hooks/use-app-update"
import { useApiCacheAutoPurge } from "@/hooks/use-api-cache-auto-purge"
import { bootIntegratedApiProbe } from "@/lib/app/integrated-api-boot"
import {
    MusicNavigationProvider,
    useMusicNavigation,
} from "@/hooks/use-music-navigation"
import { NeteaseSessionProvider } from "@/hooks/use-netease-session"
import { LikedProvider } from "@/hooks/use-liked"
import { PlayerProvider } from "@/hooks/use-player"
import type { AppRoute } from "@/lib/routes"
import { AlbumPage } from "@/pages/album"
import { ArtistPage } from "@/pages/artist"
import { HomePage } from "@/pages/home"
import { LibraryPage } from "@/pages/library"
import { LocalPage } from "@/pages/local"
import { MvPage } from "@/pages/mv"
import { PlaylistPage } from "@/pages/playlist"
import { RadioPage } from "@/pages/radio"
import { RadioProgramPage } from "@/pages/radio-program"
import { RadiosPage } from "@/pages/radios"
import { SearchPage } from "@/pages/search"
import { StatsPage } from "@/pages/stats"
import {
    readTitleBarStyle,
    SettingsPage,
    TITLE_BAR_STORAGE_KEY,
    type SettingsTab,
} from "@/pages/settings"

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

    if (detail?.type === "playlist") {
        return (
            <PlaylistPage playlistId={detail.id} onBack={back} />
        )
    }
    if (detail?.type === "artist") {
        return <ArtistPage artistId={detail.id} onBack={back} />
    }
    if (detail?.type === "album") {
        return <AlbumPage albumId={detail.id} onBack={back} />
    }
    if (detail?.type === "radio") {
        return <RadioPage radioId={detail.id} onBack={back} />
    }
    if (detail?.type === "radio-program") {
        return (
            <RadioProgramPage
                programId={detail.id}
                radioId={detail.radioId}
                onBack={back}
            />
        )
    }
    if (detail?.type === "mv") {
        return <MvPage mvId={detail.id} onBack={back} />
    }

    if (route === "home") {
        return (
            <HomePage onOpenPlaylist={openPlaylist} onOpenRadio={openRadio} />
        )
    }
    if (route === "local") {
        return <LocalPage />
    }
    if (route === "library") {
        return <LibraryPage />
    }
    if (route === "radios") {
        return <RadiosPage />
    }
    if (route === "search") {
        return <SearchPage />
    }
    if (route === "stats") {
        return <StatsPage />
    }
    if (route === "settings") {
        return (
            <SettingsPage
                titleBarStyle={titleBarStyle}
                onTitleBarStyleChange={onTitleBarStyleChange}
                initialTab={settingsTab}
            />
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

/** 挂在 Toaster 内，保证失败 toast 可展示 */
function IntegratedApiBootEffect() {
    useEffect(() => {
        void bootIntegratedApiProbe()
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