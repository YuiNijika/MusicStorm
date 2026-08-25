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
    Podcast,
    Search,
    Settings2,
    SunMedium,
    User,
    UserPlus,
    type LucideIcon,
} from "lucide-react"
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"

import { useTheme } from "@/components/app/theme-provider"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import {
    SIDEBAR_STYLE_EVENT,
    readSidebarStyle,
    type SidebarStyle,
} from "@/lib/app/sidebar-prefs"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import { resolveVipTier } from "@/lib/netease/user"
import type { AppRoute } from "@/lib/routes"
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/routes"
import { cn } from "@/lib/utils"

// 登录弹窗按需加载，避免登录表单进启动包
const NeteaseAuthDialog = lazy(() =>
    import("@/components/auth/netease-auth-dialog").then(m => ({
        default: m.NeteaseAuthDialog,
    })),
)

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

// 主导航只留内容入口，统计承电台之后便于发烧友直达，设置与账号不占导航位
const PRIMARY_ROUTES: AppRoute[] = [
    "home",
    "discover",
    "search",
    "local",
    "library",
    "radios",
    "stats",
]

type SidebarProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
    /** 详情页覆盖侧栏时隐藏选中态（如评论页） */
    showActive?: boolean
}

function Sidebar({ activeRoute, onNavigate, showActive = true }: SidebarProps) {
    const [style, setStyle] = useState<SidebarStyle>(() => readSidebarStyle())

    // 设置页切换风格即时生效，无需重开应用
    useEffect(() => {
        function onStyleChange() {
            setStyle(readSidebarStyle())
        }
        window.addEventListener(SIDEBAR_STYLE_EVENT, onStyleChange)
        return () =>
            window.removeEventListener(SIDEBAR_STYLE_EVENT, onStyleChange)
    }, [])

    if (style === "classic") {
        return (
            <ClassicSidebar
                activeRoute={activeRoute}
                onNavigate={onNavigate}
                showActive={showActive}
            />
        )
    }
    return (
        <CompactSidebar
            activeRoute={activeRoute}
            onNavigate={onNavigate}
            showActive={showActive}
        />
    )
}

function CompactSidebar({
    activeRoute,
    onNavigate,
    showActive,
}: SidebarProps) {
    const { ready, loggedIn, profile, logout } = useNeteaseSession()
    const { theme, setTheme } = useTheme()
    const [authOpen, setAuthOpen] = useState(false)

    // 底部功能图标：头像账号菜单、主题快切、设置
    const ThemeIcon =
        theme === "dark" ? MoonStar : theme === "light" ? SunMedium : Monitor

    function cycleTheme() {
        setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system")
    }

    return (
        <aside className="material-sidebar hidden w-[76px] shrink-0 flex-col items-center md:flex">
            <nav
                aria-label="主导航"
                className="mt-3 flex w-full min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 pb-2"
            >
                {PRIMARY_ROUTES.map((id) => {
                    const item = NAV_ITEMS.find((n) => n.id === id)
                    const Icon = ICONS[id]
                    const isActive = showActive && activeRoute === id
                    if (!item) {
                        return null
                    }
                    return (
                        <button
                            key={id}
                            type="button"
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => onNavigate(id)}
                            className={cn(
                                "flex w-[60px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-xl py-2",
                                "transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)]",
                                isActive
                                    ? "bg-[var(--sidebar-accent)] text-primary"
                                    : "text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                            )}
                        >
                            <Icon
                                className="size-[22px] shrink-0"
                                strokeWidth={isActive ? 2.3 : 1.9}
                            />
                            <span
                                className={cn(
                                    "text-[11px] leading-none",
                                    isActive ? "font-semibold" : "font-medium",
                                )}
                            >
                                {item.label}
                            </span>
                        </button>
                    )
                })}
            </nav>

            <div className="flex w-full flex-col items-center gap-1 border-t border-black/[0.06] px-1.5 pb-3 pt-1.5 dark:border-white/[0.06]">
                <ToolButton
                    title="切换明暗"
                    onClick={cycleTheme}
                >
                    <ThemeIcon className="size-[19px]" strokeWidth={1.9} />
                </ToolButton>
                <ToolButton
                    title="设置"
                    active={showActive && activeRoute === "settings"}
                    onClick={() => onNavigate("settings")}
                >
                    <Settings2 className="size-[19px]" strokeWidth={1.9} />
                </ToolButton>

                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label={loggedIn ? "账号" : "登录"}
                        className={cn(
                            "mt-1.5 flex size-7 cursor-pointer items-center justify-center rounded-full",
                            "transition-[background-color,transform] active:scale-[0.95] active:duration-[var(--duration-press)]",
                            "hover:bg-[var(--surface-fill-hover)]",
                        )}
                    >
                        {!ready ? (
                            <div className="size-6 animate-pulse rounded-full bg-[var(--surface-fill)]" />
                        ) : loggedIn && profile?.avatarUrl ? (
                            <img
                                src={profile.avatarUrl}
                                alt=""
                                className="size-7 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex size-7 items-center justify-center rounded-full bg-[var(--surface-fill)]">
                                {loggedIn && profile ? (
                                    <span className="text-[11px] font-medium">
                                        {profile.nickname.slice(0, 1)}
                                    </span>
                                ) : (
                                    <User className="size-3.5 opacity-70" />
                                )}
                            </div>
                        )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" className="min-w-[180px]">
                        {loggedIn ? (
                            <>
                                <div className="px-2 py-1.5">
                                    <p className="truncate text-[13px] font-medium">
                                        {profile?.nickname ?? "已登录"}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                        {profile
                                            ? `账号 · ${resolveVipTier(profile)}`
                                            : "账号"}
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
        </aside>
    )
}

function ClassicSidebar({
    activeRoute,
    onNavigate,
    showActive,
}: SidebarProps) {
    const { ready, loggedIn, profile, logout } = useNeteaseSession()
    const [authOpen, setAuthOpen] = useState(false)

    return (
        <aside className="material-sidebar hidden w-[224px] shrink-0 flex-col md:flex">
            <nav className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
                {NAV_GROUPS.map((group, groupIndex) => (
                    <div
                        key={group.id}
                        className={cn(
                            "flex flex-col",
                            groupIndex > 0 && "mt-4",
                        )}
                    >
                        <p className="px-3 pb-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground/60">
                            {group.label}
                        </p>
                        <div className="flex flex-col gap-0.5">
                            {NAV_ITEMS.filter((item) => item.group === group.id).map(
                                (item) => {
                                    const Icon = ICONS[item.id]
                                    const isActive =
                                        showActive && activeRoute === item.id

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => onNavigate(item.id)}
                                            className={cn(
                                                "group flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-[color,background-color,transform] active:scale-[0.99] active:duration-[var(--duration-press)]",
                                                isActive
                                                    ? "bg-sidebar-accent text-foreground"
                                                    : "text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                                            )}
                                        >
                                            <Icon
                                                className={cn(
                                                    "size-[18px] shrink-0 transition-opacity",
                                                    isActive ? "opacity-100" : "opacity-70",
                                                )}
                                                strokeWidth={isActive ? 2.2 : 1.9}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-medium tracking-[-0.01em]">
                                                    {item.label}
                                                </span>
                                                <span className="block truncate text-[11px] text-muted-foreground">
                                                    {item.description}
                                                </span>
                                            </span>
                                        </button>
                                    )
                                },
                            )}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="border-t border-black/[0.06] p-2 dark:border-white/[0.06]">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        className={cn(
                            "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left",
                            "transition-colors hover:bg-[var(--surface-fill)]",
                        )}
                    >
                        {!ready ? (
                            <div className="size-8 animate-pulse rounded-full bg-[var(--surface-fill)]" />
                        ) : loggedIn && profile?.avatarUrl ? (
                            <img
                                src={profile.avatarUrl}
                                alt=""
                                className="size-8 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-fill)]">
                                {loggedIn && profile ? (
                                    <span className="text-[12px] font-medium">
                                        {profile.nickname.slice(0, 1)}
                                    </span>
                                ) : (
                                    <User className="size-4 opacity-70" />
                                )}
                            </div>
                        )}
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                                {loggedIn && profile ? profile.nickname : "未登录"}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                                {loggedIn
                                    ? profile
                                    ? `账号 · ${resolveVipTier(profile)}`
                                    : "账号"
                                    : "登录 / 注册"}
                            </span>
                        </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" className="min-w-[180px]">
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
        </aside>
    )
}

function ToolButton({
    title,
    active = false,
    onClick,
    children,
}: {
    title: string
    active?: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={cn(
                "flex size-9 cursor-pointer items-center justify-center rounded-full",
                "text-muted-foreground transition-[color,background-color,transform]",
                "hover:bg-[var(--surface-fill-hover)] hover:text-foreground",
                "active:scale-[0.95] active:duration-[var(--duration-press)]",
                active && "bg-[var(--sidebar-accent)] text-primary",
            )}
        >
            {children}
        </button>
    )
}

export { Sidebar }