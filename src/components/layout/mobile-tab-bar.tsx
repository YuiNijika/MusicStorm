import {
    BarChart3,
    Compass,
    FolderOpen,
    Home,
    Library,
    Podcast,
    Search,
    type LucideIcon,
} from "lucide-react"

import type { AppRoute } from "@/lib/routes"
import { NAV_ITEMS } from "@/lib/routes"
import { cn } from "@/lib/utils"

// 仅 <md 显示；≥md 侧边栏接管
const MOBILE_TABS: AppRoute[] = ["home", "library", "search", "radios", "local"]

const ICONS: Record<AppRoute, LucideIcon> = {
    home: Home,
    discover: Compass,
    library: Library,
    radios: Podcast,
    search: Search,
    local: FolderOpen,
    stats: BarChart3,
    settings: Home,
}

type MobileTabBarProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
}

function MobileTabBar({ activeRoute, onNavigate }: MobileTabBarProps) {
    return (
        <nav
            aria-label="主导航"
            className="material-player md:hidden"
            style={{
                // iOS 底部安全区：Tab 栏贴在手势条上方
                paddingBottom: "env(safe-area-inset-bottom)",
            }}
        >
            <div className="grid grid-cols-5 gap-1 px-2 pb-1.5 pt-1.5">
                {MOBILE_TABS.map((id) => {
                    const Icon = ICONS[id]
                    const item = NAV_ITEMS.find((n) => n.id === id)
                    const isActive = activeRoute === id
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onNavigate(id)}
                            className={cn(
                                "flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl",
                                "transition-[color,background-color,transform] active:scale-[0.97] active:duration-[var(--duration-press)]",
                                isActive
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icon
                                className={cn(
                                    "size-5",
                                    isActive && "text-primary",
                                )}
                                strokeWidth={isActive ? 2.4 : 2}
                            />
                            <span className="text-[10px] font-medium tracking-[-0.01em]">
                                {item?.label ?? id}
                            </span>
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}

export { MobileTabBar }
