import { useState, type ReactNode } from "react"

import { TitleBar, type TitleBarStyle } from "@/components/app/title-bar"
import { FullPlayer } from "@/components/layout/full-player"
import { PlayerBar } from "@/components/layout/player-bar"
import { Sidebar } from "@/components/layout/sidebar"
import { usePlayerHotkeys } from "@/hooks/use-player-hotkeys"
import type { AppRoute } from "@/lib/routes"

type AppShellProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
    children: ReactNode
    titleBarStyle?: TitleBarStyle
    /** 标题栏 NEW → 设置·更新 */
    onOpenUpdate?: () => void
}

function AppShell({
    activeRoute,
    onNavigate,
    children,
    titleBarStyle = "mac",
    onOpenUpdate,
}: AppShellProps) {
    const [fullPlayerOpen, setFullPlayerOpen] = useState(false)
    usePlayerHotkeys()

    return (
        <div className="app-root flex h-screen flex-col overflow-hidden text-foreground">
            <TitleBar style={titleBarStyle} onOpenUpdate={onOpenUpdate} />
            <div className="flex min-h-0 flex-1">
                <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} />
                <main className="apple-scroll min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-[1600px] px-6 py-4 pb-8 sm:px-8">
                        {children}
                    </div>
                </main>
            </div>
            <PlayerBar onOpenFullPlayer={() => setFullPlayerOpen(true)} />
            <FullPlayer open={fullPlayerOpen} onClose={() => setFullPlayerOpen(false)} />
        </div>
    )
}

export { AppShell }