const STORAGE_KEY = "musicstorm-sidebar"
const SIDEBAR_STYLE_EVENT = "musicstorm-sidebar-style"

// 侧栏两种风格，compact 为 Bilibili 式窄条，classic 为旧版分组宽栏
type SidebarStyle = "compact" | "classic"

const DEFAULT_SIDEBAR_STYLE: SidebarStyle = "compact"

function readSidebarStyle(): SidebarStyle {
    if (typeof window === "undefined") {
        return DEFAULT_SIDEBAR_STYLE
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return raw === "classic" ? "classic" : DEFAULT_SIDEBAR_STYLE
    } catch {
        return DEFAULT_SIDEBAR_STYLE
    }
}

function setSidebarStyle(style: SidebarStyle): void {
    window.localStorage.setItem(STORAGE_KEY, style)
    // 广播让侧栏与设置页即时同步，避免跨组件传状态
    window.dispatchEvent(new Event(SIDEBAR_STYLE_EVENT))
}

export {
    DEFAULT_SIDEBAR_STYLE,
    SIDEBAR_STYLE_EVENT,
    readSidebarStyle,
    setSidebarStyle,
}
export type { SidebarStyle }