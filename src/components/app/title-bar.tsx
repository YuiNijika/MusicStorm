import { MoonStar, Palette, SunMedium } from "lucide-react"
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react"

import { useTheme } from "@/components/app/theme-provider"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWindowControls } from "@/hooks/use-window-controls"
import {
    ACCENT_OPTIONS,
    accentSwatch,
    resolveAccentHue,
} from "@/lib/appearance/appearance-prefs"
import { GITHUB_REPO_URL, openExternalUrl } from "@/lib/open-external"
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
} from "@/lib/player/full-player-prefs"
import { cn } from "@/lib/utils"

type TitleBarStyle = "mac" | "windows"

type TitleBarProps = {
    style?: TitleBarStyle
    title?: string
    subtitle?: string
}

function TitleBar({
    style = "mac",
    title = "MusicStorm",
    subtitle = "Powered by YuiNijika",
}: TitleBarProps) {
    const { isMaximized, minimize, toggleMaximize, close, startDragging } =
        useWindowControls()
    const {
        theme,
        setTheme,
        appearance,
        setAccent,
        setCustomHue,
        setGlassOpacity,
        setGlassBlur,
    } = useTheme()
    const isMacStyle = style === "mac"
    const activeHue = resolveAccentHue(appearance)
    const customActive = appearance.accent === "custom"
    const [fpLayout, setFpLayout] = useState<FullPlayerLayout>(() => getFullPlayerLayout())
    const [fpChrome, setFpChrome] = useState<FullPlayerChrome>(() => getFullPlayerChrome())

    useEffect(() => {
        function onLayout() {
            setFpLayout(getFullPlayerLayout())
        }
        function onChrome() {
            setFpChrome(getFullPlayerChrome())
        }
        window.addEventListener(LAYOUT_EVENT, onLayout)
        window.addEventListener(CHROME_EVENT, onChrome)
        return () => {
            window.removeEventListener(LAYOUT_EVENT, onLayout)
            window.removeEventListener(CHROME_EVENT, onChrome)
        }
    }, [])

    const chromeIconBtn = cn(
        "flex size-8 cursor-pointer items-center justify-center rounded-full",
        "text-foreground/70 outline-none transition-colors",
        "hover:bg-black/[0.05] hover:text-foreground active:scale-[0.97]",
        "dark:hover:bg-white/[0.08]",
    )

    function handleDragStart(event: MouseEvent) {
        startDragging(event)
    }

    return (
        <header className="app-title-bar shrink-0 select-none">
            <div
                className={cn(
                    "material-chrome flex h-12 items-center justify-between px-3",
                    isMacStyle && "relative h-[46px] px-4",
                )}
            >
                {isMacStyle ? (
                    <div className="relative z-10 flex items-center gap-2 pr-2">
                        <TrafficLight tone="close" title="关闭" onClick={close} />
                        <TrafficLight tone="minimize" title="最小化" onClick={minimize} />
                        <TrafficLight
                            tone="maximize"
                            title={isMaximized ? "还原" : "最大化"}
                            onClick={toggleMaximize}
                        />
                    </div>
                ) : (
                    <div
                        data-tauri-drag-region
                        className="flex min-w-0 flex-1 cursor-default items-center gap-2.5 pl-1"
                        onMouseDown={handleDragStart}
                        onDoubleClick={toggleMaximize}
                    >
                        <BrandMark />
                        <TitleText title={title} subtitle={subtitle} />
                    </div>
                )}

                {isMacStyle ? (
                    <div
                        data-tauri-drag-region
                        className="absolute inset-x-0 top-0 flex h-full cursor-default items-center justify-center px-24"
                        onMouseDown={handleDragStart}
                        onDoubleClick={toggleMaximize}
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <BrandMark />
                            <TitleText title={title} subtitle={subtitle} centered />
                        </div>
                    </div>
                ) : null}

                <div className="relative z-10 flex items-center gap-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className={chromeIconBtn}
                            title="外观"
                            aria-label="外观"
                        >
                            <Palette className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            sideOffset={8}
                            className="w-72 min-w-[18rem] p-2"
                        >
                            <DropdownMenuRadioGroup
                                value={theme}
                                onValueChange={(value) => {
                                    if (
                                        value === "light" ||
                                        value === "dark" ||
                                        value === "system"
                                    ) {
                                        setTheme(value)
                                    }
                                }}
                            >
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                    明暗
                                </DropdownMenuLabel>
                                <DropdownMenuRadioItem value="system" className="cursor-pointer">
                                    跟随系统
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="light" className="cursor-pointer">
                                    <SunMedium className="mr-1.5 size-3.5" />
                                    浅色
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="dark" className="cursor-pointer">
                                    <MoonStar className="mr-1.5 size-3.5" />
                                    深色
                                </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>

                            <DropdownMenuSeparator />

                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                    色调
                                </DropdownMenuLabel>
                                <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
                                    {ACCENT_OPTIONS.map((option) => {
                                        const selected = appearance.accent === option.id
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                title={option.label}
                                                onClick={() => setAccent(option.id)}
                                                className={cn(
                                                    "size-6 cursor-pointer rounded-full transition-transform duration-150",
                                                    "ring-offset-2 ring-offset-popover active:scale-95",
                                                    selected
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
                                            "relative size-6 cursor-pointer overflow-hidden rounded-full transition-transform duration-150",
                                            "ring-offset-2 ring-offset-popover active:scale-95",
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
                                <div className="space-y-1.5 px-1 pb-1.5">
                                    <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                                        自定义色相
                                        <span className="tabular-nums">{activeHue}°</span>
                                    </span>
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
                                        style={
                                            {
                                                "--progress": `${(activeHue / 359) * 100}%`,
                                            } as CSSProperties
                                        }
                                    />
                                    <div
                                        className="h-1.5 w-full rounded-full"
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
                                </div>
                            </DropdownMenuGroup>

                            <DropdownMenuSeparator />

                            <DropdownMenuGroup>
                                <div className="space-y-3 px-1 py-1.5">
                                    <label className="block space-y-1.5">
                                        <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            毛玻璃透明度
                                            <span className="tabular-nums">
                                                {Math.round(appearance.glassOpacity * 100)}%
                                            </span>
                                        </span>
                                        <input
                                            type="range"
                                            min={0.35}
                                            max={0.9}
                                            step={0.01}
                                            value={appearance.glassOpacity}
                                            onChange={(event) =>
                                                setGlassOpacity(Number(event.currentTarget.value))
                                            }
                                            className="progress-range w-full"
                                            aria-label="毛玻璃透明度"
                                            style={
                                                {
                                                    "--progress": `${((appearance.glassOpacity - 0.35) / 0.55) * 100}%`,
                                                } as CSSProperties
                                            }
                                        />
                                    </label>
                                    <label className="block space-y-1.5">
                                        <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            模糊强度
                                            <span className="tabular-nums">
                                                {Math.round(appearance.glassBlur)}px
                                            </span>
                                        </span>
                                        <input
                                            type="range"
                                            min={8}
                                            max={48}
                                            step={1}
                                            value={appearance.glassBlur}
                                            onChange={(event) =>
                                                setGlassBlur(Number(event.currentTarget.value))
                                            }
                                            className="progress-range w-full"
                                            aria-label="模糊强度"
                                            style={
                                                {
                                                    "--progress": `${((appearance.glassBlur - 8) / 40) * 100}%`,
                                                } as CSSProperties
                                            }
                                        />
                                    </label>
                                </div>
                            </DropdownMenuGroup>

                            <DropdownMenuSeparator />

                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                    播放样式
                                </DropdownMenuLabel>
                                <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
                                    {FULL_PLAYER_LAYOUTS.map((item) => {
                                        const active = fpLayout === item.id
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                title={item.description}
                                                onClick={() => {
                                                    setFullPlayerLayout(item.id)
                                                    setFpLayout(item.id)
                                                }}
                                                className={cn(
                                                    "h-7 cursor-pointer rounded-full px-2.5 text-[11px] font-medium transition-colors",
                                                    active
                                                        ? "bg-foreground text-background"
                                                        : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08]",
                                                )}
                                            >
                                                {item.label}
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="px-1 pb-1 text-[10px] leading-snug text-muted-foreground">
                                    {FULL_PLAYER_LAYOUTS.find((item) => item.id === fpLayout)
                                        ?.description ?? ""}
                                </p>
                                {fpLayout === "lyrics" ? (
                                    <div className="space-y-1.5 px-1 pb-1.5">
                                        <span className="text-[11px] text-muted-foreground">
                                            歌词对齐
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {LYRICS_ALIGNS.map((item) => {
                                                const active =
                                                    fpChrome.lyricsAlign === item.id
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setFullPlayerChrome({
                                                                lyricsAlign: item.id,
                                                            })
                                                            setFpChrome(getFullPlayerChrome())
                                                        }}
                                                        className={cn(
                                                            "h-7 cursor-pointer rounded-full px-2.5 text-[11px] font-medium transition-colors",
                                                            active
                                                                ? "bg-foreground text-background"
                                                                : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08]",
                                                        )}
                                                    >
                                                        {item.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ) : null}
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <button
                        type="button"
                        title="GitHub"
                        aria-label="在浏览器打开 GitHub 仓库"
                        className={chromeIconBtn}
                        onClick={() => void openExternalUrl(GITHUB_REPO_URL)}
                    >
                        <GitHubMark className="size-4" />
                    </button>

                    {!isMacStyle ? (
                        <div className="ml-1 flex items-center">
                            <WindowAction title="最小化" onClick={minimize}>
                                <span className="block h-px w-3 bg-current" />
                            </WindowAction>
                            <WindowAction
                                title={isMaximized ? "还原" : "最大化"}
                                onClick={toggleMaximize}
                            >
                                {isMaximized ? (
                                    <span className="relative block size-3.5">
                                        <span className="absolute right-0 top-0 size-[10px] border border-current" />
                                        <span className="absolute bottom-0 left-0 size-[10px] border border-current" />
                                    </span>
                                ) : (
                                    <span className="block size-3 border border-current" />
                                )}
                            </WindowAction>
                            <WindowAction title="关闭" onClick={close} danger>
                                <span className="relative block size-3.5">
                                    <span className="absolute left-1/2 top-1/2 h-px w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />
                                    <span className="absolute left-1/2 top-1/2 h-px w-3.5 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current" />
                                </span>
                            </WindowAction>
                        </div>
                    ) : null}
                </div>
            </div>
        </header>
    )
}

function BrandMark() {
    return <img src="/icon.svg" alt="MusicStorm" className="size-7" />
}

/** lucide 新版本已移除品牌图标，本地内联 GitHub mark */
function GitHubMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
            className={className}
        >
            <path d="M12 2C6.477 2 2 6.584 2 12.253c0 4.526 2.865 8.363 6.839 9.718.5.093.682-.222.682-.493 0-.243-.009-.888-.014-1.743-2.782.618-3.369-1.372-3.369-1.372-.455-1.18-1.11-1.494-1.11-1.494-.908-.635.069-.622.069-.622 1.004.072 1.532 1.057 1.532 1.057.892 1.564 2.341 1.112 2.91.85.091-.662.35-1.112.636-1.367-2.22-.259-4.555-1.138-4.555-5.066 0-1.119.39-2.033 1.03-2.75-.104-.26-.447-1.302.098-2.713 0 0 .84-.275 2.75 1.05A9.35 9.35 0 0 1 12 7.098c.85.004 1.705.117 2.504.343 1.909-1.325 2.747-1.05 2.747-1.05.547 1.411.204 2.453.1 2.713.64.717 1.028 1.631 1.028 2.75 0 3.939-2.339 4.804-4.566 5.058.36.317.679.942.679 1.9 0 1.371-.012 2.477-.012 2.814 0 .274.18.591.688.491C19.138 20.613 22 16.777 22 12.253 22 6.584 17.523 2 12 2Z" />
        </svg>
    )
}

function TitleText({
    title,
    subtitle,
    centered = false,
}: {
    title: string
    subtitle: string
    centered?: boolean
}) {
    return (
        <div className={cn("min-w-0", centered && "text-center")}>
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                {title}
            </p>
            <p className="truncate text-[11px] tracking-[0.01em] text-muted-foreground">
                {subtitle}
            </p>
        </div>
    )
}

function TrafficLight({
    tone,
    title,
    onClick,
}: {
    tone: "close" | "minimize" | "maximize"
    title: string
    onClick: () => void
}) {
    const toneClassName =
        tone === "close"
            ? "bg-[#ff5f57] ring-[#e0443e]/35"
            : tone === "minimize"
              ? "bg-[#febc2e] ring-[#d7a025]/35"
              : "bg-[#28c840] ring-[#20a834]/35"

    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={cn(
                "size-3 cursor-pointer rounded-full ring-1 transition-transform duration-100 ease-out active:scale-95",
                toneClassName,
            )}
        />
    )
}

function WindowAction({
    children,
    title,
    onClick,
    danger = false,
}: {
    children: ReactNode
    title: string
    onClick: () => void
    danger?: boolean
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={cn(
                "flex h-8 w-11 cursor-pointer items-center justify-center text-foreground/70 transition-colors duration-100",
                "hover:bg-black/[0.06] active:bg-black/[0.1] dark:hover:bg-white/[0.08] dark:active:bg-white/[0.12]",
                danger &&
                    "hover:bg-[#e81123] hover:text-white active:bg-[#c50f1f] dark:hover:bg-[#e81123]",
            )}
        >
            {children}
        </button>
    )
}

export { TitleBar }
export type { TitleBarStyle }