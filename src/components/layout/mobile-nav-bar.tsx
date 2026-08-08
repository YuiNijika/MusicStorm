import {
    BarChart3,
    FolderOpen,
    Home,
    Library,
    LogIn,
    LogOut,
    Podcast,
    Search,
    User,
    UserPlus,
    type LucideIcon,
} from "lucide-react"
import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from "react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import type { AppRoute } from "@/lib/routes"
import { NAV_ITEMS } from "@/lib/routes"
import { cn } from "@/lib/utils"

// 仅 <md 显示的核心 tab；≥md 侧边栏接管
const MOBILE_TABS: AppRoute[] = ["home", "local", "library", "radios", "search"]

const ICONS: Record<AppRoute, LucideIcon> = {
    home: Home,
    library: Library,
    radios: Podcast,
    search: Search,
    local: FolderOpen,
    stats: BarChart3,
    settings: Home,
}

const NeteaseAuthDialog = lazy(() =>
    import("@/components/auth/netease-auth-dialog").then(m => ({
        default: m.NeteaseAuthDialog,
    })),
)

type MobileNavBarProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
}

function MobileNavBar({ activeRoute, onNavigate }: MobileNavBarProps) {
    const { ready, loggedIn, profile, logout } = useNeteaseSession()
    const [authOpen, setAuthOpen] = useState(false)

    return (
        <nav
            aria-label="主导航"
            className="mobile-nav-bar md:hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
            <div className="flex items-center justify-between px-2 py-2">
                {/* Segmented tabs — Apple Music 风格滑动指示器 */}
                <SegmentedTabs
                    tabs={MOBILE_TABS}
                    icons={ICONS}
                    activeRoute={activeRoute}
                    onNavigate={onNavigate}
                />

                {/* 账号入口 */}
                <DropdownMenu>
                    <DropdownMenuTrigger
                        className={cn(
                            "ml-1 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full",
                            "transition-colors duration-100 active:scale-[0.95]",
                            "hover:bg-black/[0.05] dark:hover:bg-white/[0.08]",
                        )}
                    >
                        {!ready ? (
                            <div className="size-6 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.1]" />
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
}

function SegmentedTabs({ tabs, icons, activeRoute, onNavigate }: SegmentedTabsProps) {
    const indicatorRef = useRef<HTMLButtonElement>(null)

    return (
        <div className="relative flex rounded-full bg-foreground/[0.06] p-0.5">
            {tabs.map((id) => {
                const Icon = icons[id]
                const item = NAV_ITEMS.find((n) => n.id === id)
                const isActive = activeRoute === id
                return (
                    <button
                        key={id}
                        type="button"
                        ref={isActive ? indicatorRef : undefined}
                        onClick={() => onNavigate(id)}
                        className={cn(
                            "relative z-[1] flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3",
                            "text-[13px] font-medium transition-colors duration-200",
                            isActive
                                ? "text-foreground"
                                : "text-foreground/55 hover:text-foreground/75",
                        )}
                    >
                        <Icon
                            className="size-3.5 shrink-0"
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
