import { useCallback, useState, type ReactNode } from "react"

import { TitleBar, type TitleBarStyle } from "@/components/app/title-bar"
import { FullPlayer } from "@/components/layout/full-player"
import { MobileNavBar } from "@/components/layout/mobile-nav-bar"
import { PlayerBar } from "@/components/layout/player-bar"
import { Sidebar } from "@/components/layout/sidebar"
import { useAndroidBack } from "@/hooks/use-android-back"
import { useCloseToTray } from "@/hooks/use-close-to-tray"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { usePlayerHotkeys } from "@/hooks/use-player-hotkeys"
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
    const { detail, back } = useMusicNavigation()
    usePlayerHotkeys()
    useCloseToTray()
    useTrayCommands()

    // Android 返回手势：全屏播放器 → 详情页 → 顶层退出
    useAndroidBack({
        onBack: useCallback(() => {
            if (fullPlayerOpen) {
                setFullPlayerOpen(false)
                return true
            }
            if (detail) {
                back()
                return true
            }
            return false
        }, [fullPlayerOpen, detail, back]),
    })

    return (
        <div className="app-root flex h-screen flex-col overflow-hidden text-foreground">
            <div className="hidden md:block">
                <TitleBar style={titleBarStyle} onOpenUpdate={onOpenUpdate} />
            </div>

            <MobileNavBar activeRoute={activeRoute} onNavigate={onNavigate} />

            <div className="flex min-h-0 flex-1">
                <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} />

                <main className="apple-scroll min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-[1440px] px-4 pt-4 pb-24 sm:px-6 sm:py-6 md:px-8 md:pb-10 lg:px-10">
                        {children}
                    </div>
                </main>
            </div>

            {/* 底部播放条（桌面 + 移动端共用；移动端已内置 safe-area-bottom 适配） */}
            <PlayerBar onOpenFullPlayer={() => setFullPlayerOpen(true)} />
            <FullPlayer open={fullPlayerOpen} onClose={() => setFullPlayerOpen(false)} />
        </div>
    )
}

export { AppShell }
