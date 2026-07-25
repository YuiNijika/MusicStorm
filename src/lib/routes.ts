export type AppRoute =
    | "home"
    | "local"
    | "library"
    | "search"
    | "settings"

export type NavItem = {
    id: AppRoute
    label: string
    description: string
}

/** 侧栏：本地在资料库之上；资料库专指网易云 */
export const NAV_ITEMS: NavItem[] = [
    { id: "home", label: "现在就听", description: "推荐与精选" },
    { id: "local", label: "本地", description: "本机资料库" },
    { id: "library", label: "资料库", description: "网易云歌单" },
    { id: "search", label: "搜索", description: "找歌找专辑" },
    { id: "settings", label: "设置", description: "偏好与来源" },
]

/** 主内容区内的详情栈（无 react-router） */
export type MusicDetail =
    | { type: "playlist"; id: string }
    | { type: "artist"; id: string }
    | { type: "album"; id: string }
    | { type: "radio"; id: string }