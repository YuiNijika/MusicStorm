import { useState, type ReactNode } from "react"

import { TitleBar, type TitleBarStyle } from "@/components/app/title-bar"
import { FullPlayer } from "@/components/layout/full-player"
import { MobileTabBar } from "@/components/layout/mobile-tab-bar"
import { PlayerBar } from "@/components/layout/player-bar"
import { Sidebar } from "@/components/layout/sidebar"
import { usePlayerHotkeys } from "@/hooks/use-player-hotkeys"
import { useCloseToTray } from "@/hooks/use-close-to-tray"
import { useTrayCommands } from "@/hooks/use-tray-commands"
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
    useCloseToTray()
    useTrayCommands()

    return (
        <div className="app-root flex h-screen flex-col overflow-hidden text-foreground">
            {/* 移动端（Android/iOS）无桌面窗口装饰，标题栏隐藏 */}
            <div className="hidden md:block">
                <TitleBar style={titleBarStyle} onOpenUpdate={onOpenUpdate} />
            </div>
            <div className="flex min-h-0 flex-1">
                {/* 窄屏（移动端）隐藏侧边栏，导航下沉到底部 Tab */}
                <div className="hidden md:block">
                    <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} />
                </div>
                <main className="apple-scroll min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-[1440px] px-4 pt-4 pb-28 sm:px-6 sm:py-6 md:px-8 md:pb-10 lg:px-10">
                        {children}
                    </div>
                </main>
            </div>
            <PlayerBar onOpenFullPlayer={() => setFullPlayerOpen(true)} />
            <MobileTabBar activeRoute={activeRoute} onNavigate={onNavigate} />
            <FullPlayer open={fullPlayerOpen} onClose={() => setFullPlayerOpen(false)} />
        </div>
    )
}

export { AppShell }