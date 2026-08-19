export type AppRoute =
    | "home"
    | "discover"
    | "local"
    | "library"
    | "radios"
    | "search"
    | "stats"
    | "settings"

export type NavItem = {
    id: AppRoute
    label: string
    description: string
}

// 侧栏顺序：本地在资料库上；资料库 = 网易云
export const NAV_ITEMS: NavItem[] = [
    { id: "home", label: "现在就听", description: "推荐与精选" },
    { id: "discover", label: "发现", description: "榜单与新碟" },
    { id: "local", label: "本地", description: "本机资料库" },
    { id: "library", label: "资料库", description: "网易云歌单" },
    { id: "radios", label: "电台", description: "订阅与发现" },
    { id: "search", label: "搜索", description: "找歌找专辑" },
    { id: "stats", label: "统计", description: "听歌时长" },
    { id: "settings", label: "设置", description: "偏好与来源" },
]

// 主内容详情栈，状态在 navigation hook
export type MusicDetail =
    | { type: "playlist"; id: string }
    | { type: "artist"; id: string }
    | { type: "album"; id: string }
    | { type: "radio"; id: string }
    | { type: "radio-program"; id: string; radioId?: string }
    | { type: "mv"; id: string }
    | { type: "comments"; id: string; title?: string; subtitle?: string }