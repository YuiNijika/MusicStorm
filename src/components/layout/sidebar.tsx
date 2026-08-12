import {
    BarChart3,
    FolderOpen,
    Home,
    Library,
    LogIn,
    LogOut,
    Podcast,
    Search,
    Settings2,
    User,
    UserPlus,
    type LucideIcon,
} from "lucide-react"
import { lazy, Suspense, useState } from "react"

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

// 登录弹窗按需加载，避免登录表单进启动包
const NeteaseAuthDialog = lazy(() =>
    import("@/components/auth/netease-auth-dialog").then(m => ({
        default: m.NeteaseAuthDialog,
    })),
)

const ICONS: Record<AppRoute, LucideIcon> = {
    home: Home,
    library: Library,
    radios: Podcast,
    search: Search,
    local: FolderOpen,
    stats: BarChart3,
    settings: Settings2,
}

type SidebarProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
}

function Sidebar({ activeRoute, onNavigate }: SidebarProps) {
    const { ready, loggedIn, profile, logout } = useNeteaseSession()
    const [authOpen, setAuthOpen] = useState(false)

    return (
        <aside className="material-sidebar hidden w-[224px] shrink-0 flex-col md:flex">
            <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-2 pb-2">
                {NAV_ITEMS.map((item) => {
                    const Icon = ICONS[item.id]
                    const isActive = activeRoute === item.id

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
                                    isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100",
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
                })}
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
                                {loggedIn ? "账号" : "登录 / 注册"}
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

export { Sidebar }