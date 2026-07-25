import { useCallback, useState } from "react"

import { AppShell } from "@/components/app/app-shell"
import { ThemeProvider } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { Toaster, toast } from "@/components/ui/toast"
import { useApiCacheAutoPurge } from "@/hooks/use-api-cache-auto-purge"
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
import { PlaylistPage } from "@/pages/playlist"
import { RadioPage } from "@/pages/radio"
import { SearchPage } from "@/pages/search"
import {
    readTitleBarStyle,
    SettingsPage,
    TITLE_BAR_STORAGE_KEY,
} from "@/pages/settings"

import "./App.css"

function AppRoutes({
    route,
    titleBarStyle,
    onTitleBarStyleChange,
}: {
    route: AppRoute
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
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
    if (route === "search") {
        return <SearchPage />
    }
    if (route === "settings") {
        return (
            <SettingsPage
                titleBarStyle={titleBarStyle}
                onTitleBarStyleChange={onTitleBarStyleChange}
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

    useApiCacheAutoPurge()

    const handleTitleBarStyleChange = useCallback((style: TitleBarStyle) => {
        setTitleBarStyle(style)
        window.localStorage.setItem(TITLE_BAR_STORAGE_KEY, style)
    }, [])

    return (
        <ThemeProvider>
            <Toaster toastManager={toast}>
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
                                />
                            </MusicNavigationProvider>
                        </PlayerProvider>
                    </LikedProvider>
                </NeteaseSessionProvider>
            </Toaster>
        </ThemeProvider>
    )
}

function AppWithNav({
    route,
    setRoute,
    titleBarStyle,
    onTitleBarStyleChange,
}: {
    route: AppRoute
    setRoute: (route: AppRoute) => void
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
}) {
    const { closeDetail } = useMusicNavigation()

    const handleNavigate = useCallback(
        (next: AppRoute) => {
            closeDetail()
            setRoute(next)
        },
        [closeDetail, setRoute],
    )

    return (
        <AppShell
            activeRoute={route}
            onNavigate={handleNavigate}
            titleBarStyle={titleBarStyle}
        >
            <AppRoutes
                route={route}
                titleBarStyle={titleBarStyle}
                onTitleBarStyleChange={onTitleBarStyleChange}
            />
        </AppShell>
    )
}

export default App