import { useEffect, useState } from "react"
import {
    HelpCircle,
    Heart,
    MessageSquare,
    Keyboard,
    LayoutDashboard,
    Music2,
    Palette,
    SwatchBook,
    Play,
    RefreshCw,
    SlidersHorizontal,
    User,
    type LucideIcon,
} from "lucide-react"

import { NeteaseAuthDialog } from "@/components/auth/netease-auth-dialog"
import { useFrontendMode } from "@/components/app/frontend-mode-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { isWebMode } from "@/lib/web-mode"
import { openExternalUrl } from "@/lib/open-external"
import { AccountTab } from "@/pages/settings/account-tab"
import { AppearanceTab } from "@/pages/settings/appearance-tab"
import { FaqTab } from "@/pages/settings/faq-tab"
import { HotkeysTab } from "@/pages/settings/hotkeys-tab"
import { OtherTab } from "@/pages/settings/other-tab"
import { PlaybackTab } from "@/pages/settings/playback-tab"
import { SourceTab } from "@/pages/settings/source-tab"
import { ThemesTab } from "@/pages/settings/themes-tab"
import { LayoutTab } from "@/pages/settings/layout-tab"
import { UpdateTab } from "@/pages/settings/update-tab"
import type { SettingsTab } from "@/lib/app/title-bar-prefs"
import { cn } from "@/lib/utils"

const SPONSOR_URL = "https://blog.miomoe.cn/page/sponsor"

const TABS: {
    id: SettingsTab | "feedback" | "sponsor"
    label: string
    icon: LucideIcon
}[] = [
    { id: "appearance", label: "外观", icon: Palette },
    { id: "themes", label: "主题", icon: SwatchBook },
    { id: "layout", label: "布局", icon: LayoutDashboard },
    { id: "source", label: "音源", icon: Music2 },
    { id: "playback", label: "播放", icon: Play },
    { id: "account", label: "账号", icon: User },
    { id: "update", label: "更新", icon: RefreshCw },
    { id: "hotkeys", label: "快捷键", icon: Keyboard },
    { id: "faq", label: "常见问题", icon: HelpCircle },
    { id: "feedback", label: "反馈提议", icon: MessageSquare },
    { id: "sponsor", label: "支持开发", icon: Heart },
    { id: "other", label: "其他", icon: SlidersHorizontal },
]

type SettingsPageProps = {
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
    initialTab?: SettingsTab
    onOpenFeedback: () => void
    onTabChange: (tab: SettingsTab) => void
}

function SettingsPage({
    titleBarStyle,
    onTitleBarStyleChange,
    initialTab,
    onOpenFeedback,
    onTabChange,
}: SettingsPageProps) {
    const { mode } = useFrontendMode()
    const [tab, setTab] = useState<SettingsTab>(initialTab ?? "appearance")
    const [authOpen, setAuthOpen] = useState(false)

    useEffect(() => {
        if (initialTab) {
            setTab(initialTab)
        }
    }, [initialTab])

    const visibleTabs = TABS.filter((item) => {
        if (isWebMode() && item.id === "update") {
            return false
        }
        return mode === "bilibili"
            ? item.id !== "source" && item.id !== "account"
            : true
    })
    const tabVisible = visibleTabs.some((item) => item.id === tab)

    useEffect(() => {
        if (tabVisible) {
            return
        }
        setTab("layout")
        onTabChange("layout")
    }, [onTabChange, tab, tabVisible])

    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
            <h1 className="sr-only">设置</h1>
            <nav
                aria-label="设置分类"
                className="shrink-0 lg:sticky lg:top-6 lg:w-44 lg:self-start"
            >
                        <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
                    {visibleTabs.map((item) => {
                        const active = tab === item.id
                        if (item.id === "sponsor") {
                            return (
                                <a
                                    key={item.id}
                                    href={SPONSOR_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(event) => {
                                        if (isWebMode()) {
                                            return
                                        }
                                        event.preventDefault()
                                        void openExternalUrl(SPONSOR_URL)
                                    }}
                                    className="flex shrink-0 touch-manipulation items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground active:opacity-70 focus-visible:outline-2 focus-visible:outline-ring lg:w-full lg:rounded-xl"
                                >
                                    <item.icon
                                        className="size-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    <span className="whitespace-nowrap">{item.label}</span>
                                </a>
                            )
                        }
                        if (item.id === "feedback") {
                            return (
                                <a
                                    key={item.id}
                                    href="#/feedback"
                                    onClick={(event) => {
                                        if (
                                            isWebMode() &&
                                            (event.ctrlKey ||
                                                event.metaKey ||
                                                event.altKey ||
                                                event.shiftKey)
                                        ) {
                                            return
                                        }
                                        event.preventDefault()
                                        onOpenFeedback()
                                    }}
                                    className="flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:w-full lg:rounded-xl"
                                >
                                    <item.icon
                                        className="size-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    <span className="whitespace-nowrap">{item.label}</span>
                                </a>
                            )
                        }
                        const tabId = item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                aria-current={active ? "page" : undefined}
                                onClick={() => {
                                    setTab(tabId)
                                    onTabChange(tabId)
                                }}
                                className={cn(
                                    "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-[background-color,color,transform]",
                                    "active:scale-[0.98] active:duration-[var(--duration-press)]",
                                    "lg:w-full lg:rounded-xl",
                                    active
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground",
                                )}
                            >
                                <item.icon
                                    className="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="whitespace-nowrap">
                                    {item.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </nav>

            <div className="min-w-0 flex-1">
                <div
                    key={tab}
                    className="animate-in fade-in-0 slide-in-from-top-1 duration-[var(--duration-enter)] ease-[var(--ease-enter)]"
                >
                    <div
                        className="min-w-0"
                        role="region"
                        aria-label="设置内容"
                    >
                        {tab === "source" ? <SourceTab /> : null}
                        {tab === "playback" ? <PlaybackTab /> : null}
                        {tab === "account" ? (
                            <AccountTab onLogin={() => setAuthOpen(true)} />
                        ) : null}
                        {tab === "appearance" ? (
                            <AppearanceTab
                                titleBarStyle={titleBarStyle}
                                onTitleBarStyleChange={onTitleBarStyleChange}
                            />
                        ) : null}
                        {tab === "themes" ? <ThemesTab /> : null}
                        {tab === "layout" ? <LayoutTab /> : null}
                        {!isWebMode() && tab === "update" ? (
                            <UpdateTab />
                        ) : null}
                        {tab === "hotkeys" ? <HotkeysTab /> : null}
                        {tab === "faq" ? (
                            <FaqTab onOpenFeedback={onOpenFeedback} />
                        ) : null}
                        {tab === "other" ? <OtherTab /> : null}
                    </div>
                </div>
            </div>

            <NeteaseAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </div>
    )
}

export { SettingsPage }
export type { SettingsPageProps }
