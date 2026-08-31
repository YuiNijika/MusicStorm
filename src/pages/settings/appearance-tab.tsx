import { useEffect, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"

import { useTheme } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import {
    SIDEBAR_STYLE_EVENT,
    readSidebarStyle,
    setSidebarStyle,
    type SidebarStyle,
} from "@/lib/app/sidebar-prefs"
import {
    PERFORMANCE_MODE_EVENT,
    getPerformanceMode,
} from "@/lib/app/performance-prefs"
import {
    ACCENT_OPTIONS,
    accentSwatch,
    resolveAccentHue,
} from "@/lib/appearance/appearance-prefs"
import {
    TOAST_PREFS_EVENT,
    TOAST_POSITIONS,
    readToastPrefs,
    writeToastPrefs,
    type ToastPrefs,
} from "@/lib/appearance/toast-prefs"
import {
    setPlaylistTracksView,
    setPlaylistView,
    type ViewMode,
} from "@/lib/library/layout-prefs"
import { coverPathToUrl, pickCoverImage } from "@/lib/local/cover"
import {
    CHROME_EVENT,
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    LYRICS_ALIGNS,
    getFullPlayerChrome,
    getFullPlayerLayout,
    setFullPlayerChrome,
    setFullPlayerLayout,
    type FullPlayerChrome,
    type FullPlayerLayout,
    type LyricsAlign,
} from "@/lib/player/full-player-prefs"
import { notifyFromError, notifySuccess } from "@/lib/notify"
import { isNativeMacOS } from "@/lib/platform"
import {
    ActionButton,
    ChoiceChip,
    ChoiceRow,
    ChipRow,
    SettingsGroup,
    SliderField,
    SwitchRow,
    TabHeader,
} from "@/pages/settings/settings-ui"
import { cn } from "@/lib/utils"

function AppearanceTab({
    titleBarStyle,
    onTitleBarStyleChange,
}: {
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
}) {
    const {
        theme,
        setTheme,
        appearance,
        setAccent,
        setTintScope,
        setCustomHue,
        setGlassOpacity,
        setGlassBlur,
        setMaterialGlass,
        setBackgroundUrl,
        setBackgroundOpacity,
        setBackgroundBlur,
    } = useTheme()
    const [layout, setLayout] = useState<FullPlayerLayout>(() =>
        getFullPlayerLayout(),
    )
    const [chrome, setChrome] = useState<FullPlayerChrome>(() =>
        getFullPlayerChrome(),
    )
    const [performanceMode, setPerformanceModeState] = useState(() =>
        getPerformanceMode(),
    )
    const [sidebarStyle, setSidebarStyleState] = useState<SidebarStyle>(() =>
        readSidebarStyle(),
    )
    const [toastPrefs, setToastPrefsState] = useState<ToastPrefs>(() =>
        readToastPrefs(),
    )
    const activeHue = resolveAccentHue(appearance)
    const customActive = appearance.accent === "custom"
    const nativeMacOS = isNativeMacOS()
    const { playlistView, playlistTracksView } = useLibraryLayout()

    // 毛玻璃由性能模式联动控制：开启时强制关闭、关闭时恢复记忆状态
    useEffect(() => {
        function onPerformance() {
            setPerformanceModeState(getPerformanceMode())
        }
        window.addEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
        return () =>
            window.removeEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
    }, [])

    // 侧栏风格可能被其他入口修改，监听事件保持选中态同步
    useEffect(() => {
        function onSidebarStyle() {
            setSidebarStyleState(readSidebarStyle())
        }
        window.addEventListener(SIDEBAR_STYLE_EVENT, onSidebarStyle)
        return () =>
            window.removeEventListener(SIDEBAR_STYLE_EVENT, onSidebarStyle)
    }, [])

    // Toast 位置/边距跨组件即时同步
    useEffect(() => {
        function onToastPrefs() {
            setToastPrefsState(readToastPrefs())
        }
        window.addEventListener(TOAST_PREFS_EVENT, onToastPrefs)
        return () =>
            window.removeEventListener(TOAST_PREFS_EVENT, onToastPrefs)
    }, [])

    useEffect(() => {
        function onLayout() {
            setLayout(getFullPlayerLayout())
        }
        function onChrome() {
            setChrome(getFullPlayerChrome())
        }
        window.addEventListener(LAYOUT_EVENT, onLayout)
        window.addEventListener(CHROME_EVENT, onChrome)
        return () => {
            window.removeEventListener(LAYOUT_EVENT, onLayout)
            window.removeEventListener(CHROME_EVENT, onChrome)
        }
    }, [])

    function handleLayoutPick(next: FullPlayerLayout) {
        setFullPlayerLayout(next)
        setLayout(next)
    }

    function handleLyricsAlign(next: LyricsAlign) {
        setFullPlayerChrome({ lyricsAlign: next })
        setChrome(getFullPlayerChrome())
    }

    function handleToastPrefs(patch: Partial<ToastPrefs>) {
        const next = { ...readToastPrefs(), ...patch }
        writeToastPrefs(next)
        setToastPrefsState(next)
    }

    async function handlePickBackground() {
        try {
            const cover = await pickCoverImage()
            if (!cover) {
                return
            }
            const url =
                coverPathToUrl(cover.originalPath) || cover.originalPath
            setBackgroundUrl(url)
            notifySuccess("已设置背景")
        } catch (error) {
            notifyFromError("设置背景失败", error)
        }
    }

    function handleClearBackground() {
        setBackgroundUrl("")
        notifySuccess("已清除背景")
    }

    function pickView(
        current: ViewMode,
        next: ViewMode,
        apply: (mode: ViewMode) => void,
    ) {
        if (current !== next) {
            apply(next)
        }
    }

    return (
        <div className="space-y-3">
            <TabHeader title="外观" description="主题、色调、材质与全屏播放模板" />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <SettingsGroup
                    className="lg:col-span-2"
                    title="全屏播放模板"
                    description={
                        FULL_PLAYER_LAYOUTS.find(
                            (item) => item.id === layout,
                        )?.description ?? "播放样式"
                    }
                >
                    <ChipRow>
                        {FULL_PLAYER_LAYOUTS.map((item) => (
                            <ChoiceChip
                                key={item.id}
                                active={layout === item.id}
                                onClick={() => handleLayoutPick(item.id)}
                                label={item.label}
                            />
                        ))}
                    </ChipRow>
                    {layout === "lyrics" ? (
                        <ChoiceRow label="歌词对齐">
                            {LYRICS_ALIGNS.map((item) => (
                                <ChoiceChip
                                    key={item.id}
                                    active={chrome.lyricsAlign === item.id}
                                    onClick={() => handleLyricsAlign(item.id)}
                                    label={item.label}
                                />
                            ))}
                        </ChoiceRow>
                    ) : null}
                </SettingsGroup>

                <SettingsGroup title="主题与色调" description="明暗模式与强调色">
                    <ChipRow>
                        <ChoiceChip
                            active={theme === "system"}
                            onClick={() => setTheme("system")}
                            label="系统"
                        />
                        <ChoiceChip
                            active={theme === "light"}
                            onClick={() => setTheme("light")}
                            label="浅色"
                        />
                        <ChoiceChip
                            active={theme === "dark"}
                            onClick={() => setTheme("dark")}
                            label="深色"
                        />
                    </ChipRow>
                    <ChoiceRow label="调色范围">
                        <ChoiceChip
                            active={appearance.tintScope === "accent"}
                            onClick={() => setTintScope("accent")}
                            label="强调色"
                        />
                        <ChoiceChip
                            active={appearance.tintScope === "global"}
                            onClick={() => setTintScope("global")}
                            label="全局色调"
                        />
                    </ChoiceRow>
                    <p className="text-[13px] text-muted-foreground">
                        {appearance.tintScope === "global"
                            ? "背景、卡片、侧栏与玻璃材质使用低彩度染色"
                            : "仅影响按钮、选中态、焦点与图表等强调元素"}
                    </p>
                    <ChipRow className="gap-2.5">
                        {ACCENT_OPTIONS.map((option) => {
                            const active = appearance.accent === option.id
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    title={option.label}
                                    onClick={() => setAccent(option.id)}
                                    className={cn(
                                        "size-8 cursor-pointer rounded-full transition-transform",
                                        "ring-offset-2 ring-offset-background active:scale-95",
                                        active
                                            ? "ring-2 ring-foreground/80"
                                            : "ring-1 ring-black/10 dark:ring-white/15",
                                    )}
                                    style={{
                                        background: accentSwatch(
                                            option.hue,
                                            option.id === "neutral",
                                        ),
                                    }}
                                />
                            )
                        })}
                        <button
                            type="button"
                            title="自定义"
                            onClick={() => setCustomHue(appearance.customHue)}
                            className={cn(
                                "relative size-8 cursor-pointer overflow-hidden rounded-full transition-transform",
                                "ring-offset-2 ring-offset-background active:scale-95",
                                customActive
                                    ? "ring-2 ring-foreground/80"
                                    : "ring-1 ring-black/10 dark:ring-white/15",
                            )}
                            style={{
                                background: `conic-gradient(
                                    oklch(0.7 0.16 0),
                                    oklch(0.7 0.16 60),
                                    oklch(0.7 0.16 120),
                                    oklch(0.7 0.16 180),
                                    oklch(0.7 0.16 240),
                                    oklch(0.7 0.16 300),
                                    oklch(0.7 0.16 360)
                                )`,
                            }}
                        />
                    </ChipRow>
                    <label className="block space-y-2">
                        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                            <span>自定义色相</span>
                            <span className="tabular-nums flex items-center gap-2">
                                <span
                                    className="inline-block size-3 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                                    style={{
                                        background: accentSwatch(activeHue),
                                    }}
                                />
                                {activeHue}°
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={359}
                            step={1}
                            value={activeHue}
                            onChange={(event) =>
                                setCustomHue(Number(event.currentTarget.value))
                            }
                            className="progress-range w-full"
                            aria-label="自定义色相"
                        />
                        <div
                            className="h-2 w-full rounded-full"
                            style={{
                                background: `linear-gradient(
                                    to right,
                                    oklch(0.7 0.16 0),
                                    oklch(0.7 0.16 60),
                                    oklch(0.7 0.16 120),
                                    oklch(0.7 0.16 180),
                                    oklch(0.7 0.16 240),
                                    oklch(0.7 0.16 300),
                                    oklch(0.7 0.16 360)
                                )`,
                            }}
                        />
                    </label>
                </SettingsGroup>

                <SettingsGroup title="界面布局" description="标题栏、侧栏、资料库与通知">
                    {!nativeMacOS ? (
                        <ChoiceRow label="标题栏样式">
                            <ChoiceChip
                                active={titleBarStyle === "mac"}
                                onClick={() => onTitleBarStyleChange("mac")}
                                label="MAC"
                            />
                            <ChoiceChip
                                active={titleBarStyle === "windows"}
                                onClick={() => onTitleBarStyleChange("windows")}
                                label="Windows"
                            />
                        </ChoiceRow>
                    ) : null}
                    <ChoiceRow label="侧栏样式">
                        <ChoiceChip
                            active={sidebarStyle === "compact"}
                            onClick={() => {
                                setSidebarStyle("compact")
                                setSidebarStyleState("compact")
                            }}
                            label="紧凑"
                        />
                        <ChoiceChip
                            active={sidebarStyle === "classic"}
                            onClick={() => {
                                setSidebarStyle("classic")
                                setSidebarStyleState("classic")
                            }}
                            label="经典"
                        />
                    </ChoiceRow>
                    <ChoiceRow label="歌单展示">
                        <ChoiceChip
                            active={playlistView === "card"}
                            onClick={() =>
                                pickView(playlistView, "card", setPlaylistView)
                            }
                            label="卡片"
                        />
                        <ChoiceChip
                            active={playlistView === "list"}
                            onClick={() =>
                                pickView(playlistView, "list", setPlaylistView)
                            }
                            label="列表"
                        />
                    </ChoiceRow>
                    <ChoiceRow label="歌单歌曲">
                        <ChoiceChip
                            active={playlistTracksView === "card"}
                            onClick={() =>
                                pickView(
                                    playlistTracksView,
                                    "card",
                                    setPlaylistTracksView,
                                )
                            }
                            label="卡片"
                        />
                        <ChoiceChip
                            active={playlistTracksView === "list"}
                            onClick={() =>
                                pickView(
                                    playlistTracksView,
                                    "list",
                                    setPlaylistTracksView,
                                )
                            }
                            label="列表"
                        />
                    </ChoiceRow>
                    <ChoiceRow label="通知位置">
                        {TOAST_POSITIONS.map((item) => (
                            <ChoiceChip
                                key={item.id}
                                label={item.label}
                                active={toastPrefs.position === item.id}
                                onClick={() =>
                                    handleToastPrefs({ position: item.id })
                                }
                            />
                        ))}
                    </ChoiceRow>
                    <SliderField
                        label="通知边距"
                        display={`${toastPrefs.margin}px`}
                        min={0}
                        max={48}
                        step={2}
                        value={toastPrefs.margin}
                        onChange={(margin) => handleToastPrefs({ margin })}
                    />
                </SettingsGroup>

                <SettingsGroup
                    className="lg:col-span-2"
                    title="材质与背景"
                    description="性能模式下毛玻璃强制关闭"
                >
                    <SwitchRow
                        title="常驻毛玻璃"
                        checked={appearance.materialGlass}
                        disabled={performanceMode}
                        onCheckedChange={setMaterialGlass}
                    />
                    <SliderField
                        label="玻璃透明度"
                        display={`${Math.round(
                            appearance.glassOpacity * 100,
                        )}%`}
                        min={0.35}
                        max={0.9}
                        step={0.01}
                        value={appearance.glassOpacity}
                        disabled={performanceMode}
                        onChange={setGlassOpacity}
                    />
                    <SliderField
                        label="玻璃模糊"
                        display={`${Math.round(appearance.glassBlur)}px`}
                        min={8}
                        max={48}
                        step={1}
                        value={appearance.glassBlur}
                        disabled={performanceMode}
                        onChange={setGlassBlur}
                    />
                    <ChoiceRow label="背景图">
                        <ActionButton
                            icon={<ImagePlus className="size-3.5" />}
                            onClick={() => void handlePickBackground()}
                        >
                            {appearance.backgroundUrl ? "更换图片" : "选择图片"}
                        </ActionButton>
                        {appearance.backgroundUrl ? (
                            <ActionButton
                                icon={<Trash2 className="size-3.5" />}
                                className="text-destructive"
                                onClick={handleClearBackground}
                            >
                                清除
                            </ActionButton>
                        ) : null}
                    </ChoiceRow>
                    <SliderField
                        label="不透明度"
                        display={`${Math.round(
                            appearance.backgroundOpacity * 100,
                        )}%`}
                        min={0}
                        max={1}
                        step={0.05}
                        value={appearance.backgroundOpacity}
                        onChange={setBackgroundOpacity}
                    />
                    <SliderField
                        label="模糊"
                        display={`${Math.round(appearance.backgroundBlur)}px`}
                        min={0}
                        max={40}
                        step={1}
                        value={appearance.backgroundBlur}
                        onChange={setBackgroundBlur}
                    />
                </SettingsGroup>
            </div>
        </div>
    )
}

export { AppearanceTab }
