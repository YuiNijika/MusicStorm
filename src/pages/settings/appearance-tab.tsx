import { useEffect, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"

import { Section } from "@/components/music/section"
import { useTheme } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { useLibraryLayout } from "@/hooks/use-library-layout"
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
    ChoiceChip,
    SettingsCard,
    SettingsGroup,
    SliderField,
    SwitchRow,
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
        <Section title="外观" description="主题、色调、材质与全屏模板">
            <div className="space-y-3">
                <SettingsCard title="外观" description="跟随系统或固定明暗">
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                </SettingsCard>

                <SettingsGroup
                    title="色调"
                    description="预设色点，或拖动自定义色相"
                >
                    <div
                        className="apple-segmented flex w-full"
                        role="group"
                        aria-label="调色范围"
                    >
                        <button
                            type="button"
                            aria-pressed={appearance.tintScope === "accent"}
                            onClick={() => setTintScope("accent")}
                            className="apple-segmented-item min-w-0 flex-1 cursor-pointer whitespace-nowrap px-3 text-[12px] font-medium text-muted-foreground aria-pressed:text-foreground"
                        >
                            强调色
                        </button>
                        <button
                            type="button"
                            aria-pressed={appearance.tintScope === "global"}
                            onClick={() => setTintScope("global")}
                            className="apple-segmented-item min-w-0 flex-1 cursor-pointer whitespace-nowrap px-3 text-[12px] font-medium text-muted-foreground aria-pressed:text-foreground"
                        >
                            全局色调
                        </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {appearance.tintScope === "global"
                            ? "背景、卡片、侧栏与玻璃材质使用低彩度染色"
                            : "仅影响按钮、选中态、焦点与图表等强调元素"}
                    </p>
                    <div className="flex flex-wrap gap-2.5">
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
                    </div>
                    <label className="block space-y-2">
                        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
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

                <SettingsGroup
                    title="材质"
                    description="玻璃透明度与模糊强度"
                >
                    <SwitchRow
                        title="常驻毛玻璃"
                        description="侧栏、底栏与面板的毛玻璃质感，开启可能有额外性能开销"
                        checked={appearance.materialGlass}
                        disabled={performanceMode}
                        onCheckedChange={setMaterialGlass}
                    />
                    <SliderField
                        label="透明度"
                        display={`${Math.round(
                            appearance.glassOpacity * 100,
                        )}%`}
                        min={0.35}
                        max={0.9}
                        step={0.01}
                        value={appearance.glassOpacity}
                        onChange={setGlassOpacity}
                    />
                    <SliderField
                        label="模糊"
                        display={`${Math.round(appearance.glassBlur)}px`}
                        min={8}
                        max={48}
                        step={1}
                        value={appearance.glassBlur}
                        onChange={setGlassBlur}
                    />
                </SettingsGroup>

                <SettingsGroup
                    title="自定义背景"
                    description="为应用设置一张背景图，可调不透明度与模糊"
                >
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void handlePickBackground()}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            <ImagePlus className="size-3.5" />
                            {appearance.backgroundUrl
                                ? "更换图片"
                                : "选择图片"}
                        </button>
                        {appearance.backgroundUrl ? (
                            <button
                                type="button"
                                onClick={handleClearBackground}
                                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-destructive transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                            >
                                <Trash2 className="size-3.5" />
                                清除
                            </button>
                        ) : null}
                    </div>
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

                {!nativeMacOS ? (
                    <SettingsCard
                        title="标题栏样式"
                        description="无边框窗口控件布局"
                    >
                        <div className="flex flex-wrap gap-2">
                            <ChoiceChip
                                active={titleBarStyle === "mac"}
                                onClick={() => onTitleBarStyleChange("mac")}
                                label="MAC"
                            />
                            <ChoiceChip
                                active={titleBarStyle === "windows"}
                                onClick={() =>
                                    onTitleBarStyleChange("windows")
                                }
                                label="Windows"
                            />
                        </div>
                    </SettingsCard>
                ) : null}

                <SettingsCard
                    title="歌单展示"
                    description="资料库里歌单用卡片或列表"
                >
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                </SettingsCard>

                <SettingsCard
                    title="歌单歌曲"
                    description="打开歌单后歌曲用卡片或列表"
                >
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                </SettingsCard>

                <SettingsGroup
                    title="全屏播放模板"
                    description={
                        FULL_PLAYER_LAYOUTS.find(
                            (item) => item.id === layout,
                        )?.description ?? "播放样式"
                    }
                >
                    <div className="flex flex-wrap gap-2">
                        {FULL_PLAYER_LAYOUTS.map((item) => (
                            <ChoiceChip
                                key={item.id}
                                active={layout === item.id}
                                onClick={() => handleLayoutPick(item.id)}
                                label={item.label}
                            />
                        ))}
                    </div>
                    {layout === "lyrics" ? (
                        <div className="space-y-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
                            <p className="text-[12px] text-muted-foreground">
                                歌词对齐
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {LYRICS_ALIGNS.map((item) => (
                                    <ChoiceChip
                                        key={item.id}
                                        active={
                                            chrome.lyricsAlign === item.id
                                        }
                                        onClick={() =>
                                            handleLyricsAlign(item.id)
                                        }
                                        label={item.label}
                                    />
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                仅「歌词」模板：纯歌词，无封面
                            </p>
                        </div>
                    ) : null}
                </SettingsGroup>
            </div>
        </Section>
    )
}

export { AppearanceTab }
