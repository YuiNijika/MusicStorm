import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { DownloadBanner } from "@/components/app/download-banner"
import { CloseConfirmDialog } from "@/components/app/close-confirm-dialog"
import { TitleBar, type TitleBarStyle } from "@/components/app/title-bar"
import { FullPlayer } from "@/components/layout/full-player"
import { MobileNavBar } from "@/components/layout/mobile-nav-bar"
import { PlayerBar } from "@/components/layout/player-bar"
import { Sidebar } from "@/components/layout/sidebar"
import { useAndroidBack } from "@/hooks/use-android-back"
import { useAndroidNowPlaying } from "@/hooks/use-android-now-playing"
import { useCloseToTray } from "@/hooks/use-close-to-tray"
import { useAutoSignin } from "@/hooks/use-auto-signin"
import { useMacOSNowPlaying } from "@/hooks/use-macos-now-playing"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useNowPlayingTitle } from "@/hooks/use-now-playing-title"
import { usePlayerHotkeys } from "@/hooks/use-player-hotkeys"
import { useTrayCommands } from "@/hooks/use-tray-commands"
import { isNativeMacOS } from "@/lib/platform"
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
    const mainRef = useRef<HTMLElement>(null)
    // 页面容器常驻，切页/详情变化时滚动位置会残留（表现为新页面居中），
    // 每次路由变化统一回到顶部
    useEffect(() => {
        mainRef.current?.scrollTo({ top: 0, left: 0 })
    }, [activeRoute, detail])
    // 网页版无窗口/托盘/系统媒体集成；桌面 hooks 内部自带 web 守卫
    usePlayerHotkeys()
    const { askOpen, cancelClose, confirmClose } = useCloseToTray()
    useTrayCommands()
    useAutoSignin()
    useMacOSNowPlaying()
    useAndroidNowPlaying()
    useNowPlayingTitle()
    const nativeMacOS = isNativeMacOS()

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
            {!nativeMacOS ? (
                <div className="hidden md:block">
                    <TitleBar
                        style={titleBarStyle}
                        onOpenUpdate={onOpenUpdate}
                    />
                </div>
            ) : null}

            {/* 网页版下载提示条：navbar 下方、内容上方；桌面版不渲染 */}
            <DownloadBanner />

            <MobileNavBar activeRoute={activeRoute} onNavigate={onNavigate} showActive={detail?.type !== "comments"} />

            <div className="flex min-h-0 flex-1">
                <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} showActive={detail?.type !== "comments"} />

                <main
                    ref={mainRef}
                    className="page-content-host apple-scroll min-w-0 flex-1 overflow-y-auto"
                >
                    <div className="w-full px-4 pt-4 pb-24 sm:px-6 sm:py-6 md:px-10 md:pb-10 xl:px-16">
                        {children}
                    </div>
                </main>
            </div>

            {/* 底部播放条（桌面 + 移动端共用；移动端已内置 safe-area-bottom 适配） */}
            <PlayerBar onOpenFullPlayer={() => setFullPlayerOpen(true)} />
            <FullPlayer open={fullPlayerOpen} onClose={() => setFullPlayerOpen(false)} />
            <CloseConfirmDialog
                open={askOpen}
                onConfirm={(action, noAsk) => void confirmClose(action, noAsk)}
                onCancel={cancelClose}
            />
        </div>
    )
}

export { AppShell }