export type AppRoute =
    | "home"
    | "discover"
    | "local"
    | "library"
    | "radios"
    | "search"
    | "stats"
    | "settings"

// 侧栏三分区：发现音乐（被动推荐+主动找歌）/ 我的音乐（双来源收藏）/ 更多（运维与偏好）
export type NavGroup = "browse" | "library-mine" | "system"

export type NavItem = {
    id: AppRoute
    label: string
    description: string
    group: NavGroup
}

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
    { id: "browse", label: "发现音乐" },
    { id: "library-mine", label: "我的音乐" },
    { id: "system", label: "更多" },
]

// 侧栏顺序
export const NAV_ITEMS: NavItem[] = [
    { id: "home", label: "首页", description: "推荐与精选", group: "browse" },
    { id: "discover", label: "发现", description: "榜单与新碟", group: "browse" },
    { id: "search", label: "搜索", description: "找歌找专辑", group: "browse" },
    { id: "local", label: "本地", description: "本机资料库", group: "library-mine" },
    { id: "library", label: "资料库", description: "网易云歌单", group: "library-mine" },
    { id: "radios", label: "电台", description: "订阅与发现", group: "library-mine" },
    { id: "stats", label: "统计", description: "听歌时长", group: "system" },
    { id: "settings", label: "设置", description: "偏好与来源", group: "system" },
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