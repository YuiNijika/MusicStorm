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
        // 新版本存 JSON，旧版本只存风格字符串，两种都兼容
        if (raw === "classic" || raw === "compact") {
            return raw
        }
        if (!raw) {
            return DEFAULT_SIDEBAR_STYLE
        }
        const parsed = JSON.parse(raw) as { style?: unknown }
        return parsed.style === "classic" ? "classic" : DEFAULT_SIDEBAR_STYLE
    } catch {
        return DEFAULT_SIDEBAR_STYLE
    }
}

function setSidebarStyle(style: SidebarStyle): void {
    // 保留 JSON 形态，便于未来扩展其他侧栏偏好
    let navOrder: string[] = []
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw && raw !== "classic" && raw !== "compact") {
            const parsed = JSON.parse(raw) as { navOrder?: unknown }
            if (Array.isArray(parsed.navOrder)) {
                navOrder = parsed.navOrder.filter(
                    (id): id is string => typeof id === "string",
                )
            }
        }
    } catch {
        // 解析失败按空处理
    }
    window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ style, navOrder }),
    )
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
