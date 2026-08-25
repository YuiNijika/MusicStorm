import {
    BarChart3,
    Compass,
    FolderOpen,
    Home,
    Library,
    LogIn,
    LogOut,
    Monitor,
    MoonStar,
    Palette,
    Podcast,
    Search,
    Settings2,
    SunMedium,
    User,
    UserPlus,
    type LucideIcon,
} from "lucide-react"
import {
    lazy,
    Suspense,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/app/theme-provider"
import { useNeteaseSessionSafe } from "@/hooks/use-netease-session"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import {
    ACCENT_OPTIONS,
    accentSwatch,
    resolveAccentHue,
} from "@/lib/appearance/appearance-prefs"
import type { AppRoute } from "@/lib/routes"
import { NAV_ITEMS } from "@/lib/routes"
import { cn } from "@/lib/utils"

// 仅 <md 显示的核心 tab；≥md 侧边栏接管
const MOBILE_TABS: AppRoute[] = [
    "home",
    "discover",
    "local",
    "library",
    "radios",
    "search",
    "stats",
    "settings",
]

const ICONS: Record<AppRoute, LucideIcon> = {
    home: Home,
    discover: Compass,
    library: Library,
    radios: Podcast,
    search: Search,
    local: FolderOpen,
    stats: BarChart3,
    settings: Settings2,
}

const NeteaseAuthDialog = lazy(() =>
    import("@/components/auth/netease-auth-dialog").then(m => ({
        default: m.NeteaseAuthDialog,
    })),
)

type MobileNavBarProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
    showActive?: boolean
}

function MobileNavBar({ activeRoute, onNavigate, showActive = true }: MobileNavBarProps) {
    const { ready, loggedIn, profile, logout } = useNeteaseSessionSafe()
    const {
        theme,
        setTheme,
        appearance,
        setAccent,
        setTintScope,
        setCustomHue,
        setGlassOpacity,
        setGlassBlur,
    } = useTheme()
    const [authOpen, setAuthOpen] = useState(false)
    const customActive = appearance.accent === "custom"
    const customHue = resolveAccentHue(appearance)

    return (
        <nav
            aria-label="主导航"
            className="mobile-nav-bar md:hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
            <div className="flex items-center justify-between gap-1 px-2 py-2">
                {/* Segmented tabs — Apple Music 风格滑动指示器 */}
                <SegmentedTabs
                    tabs={MOBILE_TABS}
                    icons={ICONS}
                    activeRoute={activeRoute}
                    onNavigate={onNavigate}
                    showActive={showActive}
                />

                <div className="flex shrink-0 items-center">
                    {/* 调色板：移动端快捷换主题色，不打断当前页面 */}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label="主题色"
                            className={cn(
                                "flex size-9 cursor-pointer items-center justify-center rounded-full",
                                "text-foreground/60 transition-[color,background-color,transform] active:scale-[0.95] active:duration-[var(--duration-press)]",
                                "hover:bg-[var(--surface-fill)] hover:text-foreground",
                            )}
                        >
                            <Palette className="size-4" strokeWidth={1.9} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side="bottom"
                            align="end"
                            className="w-72 max-w-[calc(100vw-2rem)] p-3"
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
                                <div className="flex flex-col">
                                    <DropdownMenuRadioItem
                                        value="system"
                                        className="cursor-pointer"
                                    >
                                        <Monitor className="mr-1.5 size-3.5" />
                                        系统
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem
                                        value="light"
                                        className="cursor-pointer"
                                    >
                                        <SunMedium className="mr-1.5 size-3.5" />
                                        浅色
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem
                                        value="dark"
                                        className="cursor-pointer"
                                    >
                                        <MoonStar className="mr-1.5 size-3.5" />
                                        深色
                                    </DropdownMenuRadioItem>
                                </div>
                            </DropdownMenuRadioGroup>

                            <DropdownMenuSeparator />

                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                    色调
                                </DropdownMenuLabel>
                                <div
                                    className="apple-segmented mx-1 mb-2 flex"
                                    role="group"
                                    aria-label="调色范围"
                                >
                                    <button
                                        type="button"
                                        aria-pressed={appearance.tintScope === "accent"}
                                        onClick={() => setTintScope("accent")}
                                        className="apple-segmented-item min-w-0 flex-1 cursor-pointer whitespace-nowrap px-2.5 text-[11px] font-medium text-muted-foreground aria-pressed:text-foreground"
                                    >
                                        强调色
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={appearance.tintScope === "global"}
                                        onClick={() => setTintScope("global")}
                                        className="apple-segmented-item min-w-0 flex-1 cursor-pointer whitespace-nowrap px-2.5 text-[11px] font-medium text-muted-foreground aria-pressed:text-foreground"
                                    >
                                        全局色调
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2.5">
                                    {ACCENT_OPTIONS.map((option) => {
                                        const active = appearance.accent === option.id
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                aria-label={option.label}
                                                onClick={() => setAccent(option.id)}
                                                className={cn(
                                                    "size-7 cursor-pointer rounded-full transition-transform",
                                                    "ring-offset-2 ring-offset-popover active:scale-95",
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
                                        aria-label="自定义色相"
                                        onClick={() => setCustomHue(customHue)}
                                        className={cn(
                                            "size-7 cursor-pointer overflow-hidden rounded-full transition-transform",
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
                                        <span className="tabular-nums">
                                            {customHue}°
                                        </span>
                                    </span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={359}
                                        step={1}
                                        value={customHue}
                                        onChange={(event) =>
                                            setCustomHue(Number(event.currentTarget.value))
                                        }
                                        className="progress-range w-full"
                                        aria-label="自定义色相"
                                        style={
                                            {
                                                "--progress": `${(customHue / 359) * 100}%`,
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
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                    毛玻璃
                                </DropdownMenuLabel>
                                <div className="space-y-3 px-1 py-1.5">
                                    <label className="block space-y-1.5">
                                        <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            透明度
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
                                            模糊
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
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* 账号入口 */}
                    <DropdownMenu>
                    <DropdownMenuTrigger
                        className={cn(
                            "ml-1 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full",
                            "transition-[color,background-color,transform] active:scale-[0.95] active:duration-[var(--duration-press)]",
                            "hover:bg-[var(--surface-fill)]",
                        )}
                    >
                        {!ready ? (
                            <div className="size-6 animate-pulse rounded-full bg-[var(--surface-fill)]" />
                        ) : loggedIn && profile?.avatarUrl ? (
                            <img
                                src={profile.avatarUrl}
                                alt=""
                                className="size-6 rounded-full object-cover"
                            />
                        ) : (
                            <User className="size-5 opacity-60" />
                        )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="end" className="min-w-[160px]">
                        {loggedIn ? (
                            <>
                                <div className="px-2 py-1.5">
                                    <p className="truncate text-[13px] font-medium">
                                        {profile?.nickname ?? "已登录"}
                                    </p>
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => logout()}
                                    className="cursor-pointer gap-2"
                                >
                                    <LogOut className="size-3.5" />
                                    退出
                                </DropdownMenuItem>
                            </>
                        ) : (
                            <>
                                <DropdownMenuItem
                                    onClick={() => setAuthOpen(true)}
                                    className="cursor-pointer gap-2"
                                >
                                    <LogIn className="size-3.5" />
                                    登录
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => void openNeteaseRegister()}
                                    className="cursor-pointer gap-2"
                                >
                                    <UserPlus className="size-3.5" />
                                    注册
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                </div>
            </div>

            {authOpen ? (
                <Suspense fallback={null}>
                    <NeteaseAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
                </Suspense>
            ) : null}
        </nav>
    )
}

// ─── Segmented control ───────────────────────────────────────────────────────

type SegmentedTabsProps = {
    tabs: AppRoute[]
    icons: Record<AppRoute, LucideIcon>
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
    showActive?: boolean
}

function SegmentedTabs({ tabs, icons, activeRoute, onNavigate, showActive = true }: SegmentedTabsProps) {
    const indicatorRef = useRef<HTMLButtonElement>(null)

    return (
        <div className="material-segmented relative flex rounded-full p-0.5">
            {tabs.map((id) => {
                const Icon = icons[id]
                const item = NAV_ITEMS.find((n) => n.id === id)
                const isActive = showActive && activeRoute === id
                return (
                    <button
                        key={id}
                        type="button"
                        ref={isActive ? indicatorRef : undefined}
                        onClick={() => onNavigate(id)}
                        className={cn(
                            "relative z-[1] flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-2.5 sm:gap-1.5 sm:px-3",
                            "text-[12px] font-medium transition-colors duration-200 sm:text-[13px]",
                            isActive
                                ? "text-foreground"
                                : "text-foreground/55 hover:text-foreground/75",
                        )}
                    >
                        <Icon
                            className="size-4 shrink-0 sm:size-3.5"
                            strokeWidth={isActive ? 2.2 : 1.8}
                        />
                        <span className="hidden sm:inline">{item?.label ?? id}</span>
                    </button>
                )
            })}
            <SegmentedIndicator
                containerRef={indicatorRef}
                activeIndex={tabs.indexOf(activeRoute)}
            />
        </div>
    )
}

// ─── Spring-tracked indicator ────────────────────────────────────────────────

type SegmentedIndicatorProps = {
    containerRef: React.RefObject<HTMLButtonElement | null>
    activeIndex: number
}

function SegmentedIndicator({ containerRef, activeIndex }: SegmentedIndicatorProps) {
    const [style, setStyle] = useState<React.CSSProperties>({ left: 0, width: 0 })
    const mounted = useRef(false)

    const sync = useCallback(() => {
        const el = containerRef.current
        const parent = el?.parentElement
        if (!el || !parent) return
        const parentRect = parent.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        setStyle({
            left: elRect.left - parentRect.left,
            width: elRect.width,
        })
    }, [containerRef])

    useLayoutEffect(() => {
        sync()
        mounted.current = true
    }, [sync, activeIndex])

    return (
        <div
            aria-hidden
            className={cn(
                "absolute inset-y-0.5 rounded-full bg-background shadow-sm",
                "ring-1 ring-black/[0.06] dark:ring-white/[0.1]",
            )}
            style={{
                left: style.left,
                width: style.width,
                transition: mounted.current
                    ? "left var(--duration-enter) var(--ease-enter), width var(--duration-enter) var(--ease-enter)"
                    : "none",
            }}
        />
    )
}

export { MobileNavBar }
