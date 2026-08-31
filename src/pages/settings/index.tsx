import { useEffect, useState } from "react"
import {
    HelpCircle,
    Keyboard,
    Music2,
    Palette,
    Play,
    RefreshCw,
    SlidersHorizontal,
    User,
    type LucideIcon,
} from "lucide-react"

import { NeteaseAuthDialog } from "@/components/auth/netease-auth-dialog"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { isWebMode } from "@/lib/web-mode"
import { AccountTab } from "@/pages/settings/account-tab"
import { AppearanceTab } from "@/pages/settings/appearance-tab"
import { FaqTab } from "@/pages/settings/faq-tab"
import { HotkeysTab } from "@/pages/settings/hotkeys-tab"
import { OtherTab } from "@/pages/settings/other-tab"
import { PlaybackTab } from "@/pages/settings/playback-tab"
import { SourceTab } from "@/pages/settings/source-tab"
import { UpdateTab } from "@/pages/settings/update-tab"
import type { SettingsTab } from "@/lib/app/title-bar-prefs"
import { cn } from "@/lib/utils"

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
    { id: "appearance", label: "外观", icon: Palette },
    { id: "source", label: "音源", icon: Music2 },
    { id: "playback", label: "播放", icon: Play },
    { id: "account", label: "账号", icon: User },
    { id: "update", label: "更新", icon: RefreshCw },
    { id: "hotkeys", label: "快捷键", icon: Keyboard },
    { id: "faq", label: "常见问题", icon: HelpCircle },
    { id: "other", label: "其他", icon: SlidersHorizontal },
]

type SettingsPageProps = {
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
    initialTab?: SettingsTab
}

function SettingsPage({
    titleBarStyle,
    onTitleBarStyleChange,
    initialTab,
}: SettingsPageProps) {
    const [tab, setTab] = useState<SettingsTab>(initialTab ?? "appearance")
    const [authOpen, setAuthOpen] = useState(false)

    useEffect(() => {
        if (initialTab) {
            setTab(initialTab)
        }
    }, [initialTab])

    const visibleTabs = isWebMode()
        ? TABS.filter((item) => item.id !== "update")
        : TABS

    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
            <nav
                aria-label="设置分类"
                className="shrink-0 lg:sticky lg:top-6 lg:w-44 lg:self-start"
            >
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
                    {visibleTabs.map((item) => {
                        const active = tab === item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                aria-current={active ? "page" : undefined}
                                onClick={() => setTab(item.id)}
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
                    {!isWebMode() && tab === "update" ? <UpdateTab /> : null}
                    {tab === "hotkeys" ? <HotkeysTab /> : null}
                    {tab === "faq" ? <FaqTab /> : null}
                    {tab === "other" ? <OtherTab /> : null}
                </div>
            </div>

            <NeteaseAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </div>
    )
}

export { SettingsPage }
export type { SettingsPageProps }
