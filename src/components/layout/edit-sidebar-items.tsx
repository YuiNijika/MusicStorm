type NavItem = {
    id: string
    label: string
    description: string
}

type EditSidebarItemsProps = {
    navOrder: string[]
    onDone: () => void
}

function EditSidebarItems({
    navOrder,
    onDone,
}: EditSidebarItemsProps) {
    // 从路由 ID 获取导航项标签
    const getNavItem = (id: string): NavItem => {
        const mapping: Record<string, NavItem> = {
            home: { id: "home", label: "现在就听", description: "推荐与精选" },
            discover: { id: "discover", label: "发现", description: "榜单与新碟" },
            local: { id: "local", label: "本地", description: "本机资料库" },
            library: { id: "library", label: "资料库", description: "网易云歌单" },
            radios: { id: "radios", label: "电台", description: "订阅与发现" },
            search: { id: "search", label: "搜索", description: "找歌找专辑" },
            stats: { id: "stats", label: "统计", description: "听歌时长" },
            settings: { id: "settings", label: "设置", description: "偏好与来源" },
        }
        return mapping[id] || { id, label: id, description: "" }
    }

    const items = navOrder.map(getNavItem)

    return (
        <div className="space-y-1">
            {items.map((item) => (
                <div
                    key={item.id}
                    className="flex items-center gap-2 px-2 py-1 rounded-[6px] transition-colors hover:bg-[var(--surface-fill)]"
                    onMouseDown={(e) => {
                        e.preventDefault()
                        window.dispatchEvent(
                            new CustomEvent("sidebar:dragitem", {
                                detail: { id: item.id, item },
                            })
                        )
                    }}
                    style={{ cursor: "grab" }}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-3 cursor-move select-none"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M18 6L6 18m0-6l12 12" />
                    </svg>
                    <span className="truncate flex-1">
                        {item.label}
                    </span>
                </div>
            ))}
            <button
                onClick={onDone}
                className="w-full flex items-center justify-center py-2 rounded-[6px] mt-2 text-sm font-medium text-primary hover:bg-[var(--surface-fill)]"
            >
                完成
            </button>
        </div>
    )
}

export { EditSidebarItems }