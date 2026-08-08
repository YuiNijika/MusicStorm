import {
    BarChart3,
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

// Apple Music 风格 tab；仅 <md 显示，≥md 侧边栏接管
const MOBILE_TABS: AppRoute[] = ["home", "library", "search", "radios", "local"]

const ICONS: Record<AppRoute, LucideIcon> = {
    home: Home,
    library: Library,
    radios: Podcast,
    search: Search,
    local: FolderOpen,
    stats: BarChart3,
    settings: Home,
}

type MobileNavBarProps = {
    activeRoute: AppRoute
    onNavigate: (route: AppRoute) => void
}

function MobileNavBar({ activeRoute, onNavigate }: MobileNavBarProps) {
    return (
        <nav
            aria-label="主导航"
            className="mobile-nav-bar md:hidden"
            style={{
                // iOS 顶部安全区：导航栏不贴入状态栏
                paddingTop: "env(safe-area-inset-top)",
            }}
        >
            <div className="flex items-center gap-1 px-2 py-2">
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
                                "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5",
                                "text-[13px] font-medium transition-colors duration-100",
                                "active:scale-[0.97]",
                                isActive
                                    ? "bg-foreground/10 text-foreground"
                                    : "text-foreground/60 hover:text-foreground/80",
                            )}
                        >
                            <Icon
                                className="size-4 shrink-0"
                                strokeWidth={isActive ? 2.2 : 1.8}
                            />
                            <span>{item?.label ?? id}</span>
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}

export { MobileNavBar }
