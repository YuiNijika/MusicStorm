import type { AppRoute } from "@/lib/routes"

export type FrontendMode = "netease" | "bilibili"

export type WorkspaceModuleId = Extract<
    AppRoute,
    | "home"
    | "bilibili"
    | "discover"
    | "search"
    | "local"
    | "library"
    | "radios"
    | "stats"
>

export type WorkspaceModule = {
    id: WorkspaceModuleId
    label: string
    description: string
}

export type WorkspaceLayoutItem = {
    id: WorkspaceModuleId
    visible: boolean
}

export type WorkspaceLayouts = Record<FrontendMode, WorkspaceLayoutItem[]>

export const FRONTEND_MODE_OPTIONS: {
    id: FrontendMode
    label: string
    description: string
}[] = [
    {
        id: "netease",
        label: "网易云模式",
        description: "发现、歌单、电台与网易云搜索",
    },
    {
        id: "bilibili",
        label: "B站模式",
 description: "音乐排行、音频搜索与收藏夹",
    },
]

export const WORKSPACE_MODULES: Record<
    FrontendMode,
    WorkspaceModule[]
> = {
    netease: [
        {
            id: "home",
            label: "首页",
            description: "推荐与精选",
        },
        {
            id: "discover",
            label: "发现",
            description: "榜单与新碟",
        },
        {
            id: "search",
            label: "搜索",
            description: "找歌、专辑与播客",
        },
        {
            id: "local",
            label: "本地",
            description: "本机资料库",
        },
        {
            id: "library",
            label: "资料库",
            description: "网易云歌单",
        },
        {
            id: "radios",
            label: "电台",
            description: "订阅与发现",
        },
        {
            id: "stats",
            label: "统计",
            description: "听歌时长",
        },
    ],
    bilibili: [
 {
 id: "bilibili",
 label: "音乐",
 description: "排行、翻唱与现场",
 },
 {
 id: "search",
 label: "搜索",
 description: "查找音乐与音频",
 },
 {
 id: "library",
 label: "收藏夹",
 description: "登录账号的B站收藏夹",
 },
 {
 id: "local",
 label: "本地",
 description: "本机音乐",
 },
 {
 id: "stats",
 label: "统计",
 description: "播放与来源",
 },
 ],
}

export const DEFAULT_WORKSPACE_LAYOUTS: WorkspaceLayouts = {
    netease: WORKSPACE_MODULES.netease.map((module) => ({
        id: module.id,
        visible: true,
    })),
    bilibili: WORKSPACE_MODULES.bilibili.map((module) => ({
        id: module.id,
        visible: true,
    })),
}

const MODE_STORAGE_KEY = "musicstorm-frontend-mode"
const MODE_SETUP_STORAGE_KEY = "musicstorm-frontend-mode-setup"
const LAYOUT_STORAGE_KEY = "musicstorm-workspace-layouts"
const MODE_EVENT = "musicstorm:frontend-mode"

function isFrontendMode(value: unknown): value is FrontendMode {
    return value === "netease" || value === "bilibili"
}

function moduleIds(mode: FrontendMode): WorkspaceModuleId[] {
    return WORKSPACE_MODULES[mode].map((module) => module.id)
}

function normalizeLayout(
    mode: FrontendMode,
    value: unknown,
): WorkspaceLayoutItem[] {
    const defaults = DEFAULT_WORKSPACE_LAYOUTS[mode]
    const allowed = new Set(moduleIds(mode))
    const seen = new Set<WorkspaceModuleId>()
    const items: WorkspaceLayoutItem[] = []

    if (Array.isArray(value)) {
        for (const entry of value) {
            if (!entry || typeof entry !== "object") {
                continue
            }
            const id = "id" in entry ? entry.id : null
            if (
                typeof id !== "string" ||
                !allowed.has(id as WorkspaceModuleId) ||
                seen.has(id as WorkspaceModuleId)
            ) {
                continue
            }
            const typedId = id as WorkspaceModuleId
            seen.add(typedId)
            items.push({
                id: typedId,
                visible:
                    "visible" in entry ? Boolean(entry.visible) : true,
            })
        }
    }

    for (const fallback of defaults) {
        if (!seen.has(fallback.id)) {
            items.push({ ...fallback })
        }
    }
    if (!items.some((item) => item.visible)) {
        const first = items[0] ?? defaults[0]
        if (first) {
            first.visible = true
        }
    }
    return items
}

function readFrontendMode(): FrontendMode {
    if (typeof window === "undefined") {
        return "netease"
    }
    try {
        const stored = window.localStorage.getItem(MODE_STORAGE_KEY)
        return isFrontendMode(stored) ? stored : "netease"
    } catch {
        return "netease"
    }
}

function writeFrontendMode(mode: FrontendMode): void {
    applyFrontendModeToDom(mode)
    try {
        window.localStorage.setItem(MODE_STORAGE_KEY, mode)
        window.localStorage.setItem(MODE_SETUP_STORAGE_KEY, "1")
    } catch {
        // Keep the current session usable when storage is unavailable
    }
    window.dispatchEvent(
        new CustomEvent<FrontendMode>(MODE_EVENT, { detail: mode }),
    )
}

function hasSelectedFrontendMode(): boolean {
    if (typeof window === "undefined") {
        return true
    }
    try {
        return window.localStorage.getItem(MODE_SETUP_STORAGE_KEY) === "1"
    } catch {
        return false
    }
}

function readWorkspaceLayouts(): WorkspaceLayouts {
    if (typeof window === "undefined") {
        return DEFAULT_WORKSPACE_LAYOUTS
    }
    try {
        const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
        if (!raw) {
            return DEFAULT_WORKSPACE_LAYOUTS
        }
        const parsed = JSON.parse(raw) as Partial<WorkspaceLayouts>
        return {
            netease: normalizeLayout("netease", parsed.netease),
            bilibili: normalizeLayout("bilibili", parsed.bilibili),
        }
    } catch {
        return DEFAULT_WORKSPACE_LAYOUTS
    }
}

function writeWorkspaceLayouts(layouts: WorkspaceLayouts): void {
    try {
        window.localStorage.setItem(
            LAYOUT_STORAGE_KEY,
            JSON.stringify(layouts),
        )
    } catch {
        // Layout changes still apply for this session
    }
}

function applyFrontendModeToDom(mode: FrontendMode): void {
    document.documentElement.dataset.frontendMode = mode
}

function getWorkspaceModule(
    mode: FrontendMode,
    id: WorkspaceModuleId,
): WorkspaceModule | null {
    return WORKSPACE_MODULES[mode].find((module) => module.id === id) ?? null
}

function resolveModeHome(mode: FrontendMode): WorkspaceModuleId {
    const first = DEFAULT_WORKSPACE_LAYOUTS[mode].find((item) => item.visible)
    return first?.id ?? (mode === "bilibili" ? "bilibili" : "home")
}

export {
    applyFrontendModeToDom,
    getWorkspaceModule,
    hasSelectedFrontendMode,
    normalizeLayout,
    readFrontendMode,
    readWorkspaceLayouts,
    resolveModeHome,
    writeFrontendMode,
    writeWorkspaceLayouts,
}
