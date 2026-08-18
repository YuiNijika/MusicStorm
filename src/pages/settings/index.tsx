import { useEffect, useState } from "react"

import { NeteaseAuthDialog } from "@/components/auth/netease-auth-dialog"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { isWebMode } from "@/lib/web-mode"
import { AccountTab } from "@/pages/settings/account-tab"
import { AppearanceTab } from "@/pages/settings/appearance-tab"
import { HotkeysTab } from "@/pages/settings/hotkeys-tab"
import { OtherTab } from "@/pages/settings/other-tab"
import { PlaybackTab } from "@/pages/settings/playback-tab"
import { SourceTab } from "@/pages/settings/source-tab"
import { UpdateTab } from "@/pages/settings/update-tab"
import type { SettingsTab } from "@/lib/app/title-bar-prefs"

const TABS: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: "外观" },
    { id: "source", label: "音源" },
    { id: "playback", label: "播放" },
    { id: "account", label: "账号" },
    { id: "update", label: "更新" },
    { id: "hotkeys", label: "快捷键" },
    { id: "other", label: "其他" },
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

    return (
        <div className="space-y-5">
            <SegmentedControl
                items={
                    isWebMode()
                        ? TABS.filter((item) => item.id !== "update")
                        : TABS
                }
                value={tab}
                onChange={(id) => setTab(id as SettingsTab)}
                className="w-fit max-w-full"
            />

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
                {tab === "other" ? <OtherTab /> : null}
            </div>

            <NeteaseAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </div>
    )
}

export { SettingsPage }
export type { SettingsPageProps }
