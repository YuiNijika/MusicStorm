import {
    BarChart3,
 AudioLines,
    Compass,
    FolderOpen,
    Home,
    Library,
    Music2,
    Podcast,
    Search,
    type LucideIcon,
} from "lucide-react"
import { useState } from "react"

import { useFrontendMode } from "@/components/app/frontend-mode-provider"
import { DragList } from "@/components/music/drag-list"
import { Switch } from "@/components/ui/switch"
import {
    FRONTEND_MODE_OPTIONS,
    WORKSPACE_MODULES,
    type WorkspaceLayoutItem,
    type WorkspaceModule,
    type WorkspaceModuleId,
} from "@/lib/frontend-mode"
import { notifySuccess, notifyWarning } from "@/lib/notify"
import { cn } from "@/lib/utils"
import {
    ActionButton,
    SettingsGroup,
    TabHeader,
} from "@/pages/settings/settings-ui"

const MODULE_ICONS: Record<WorkspaceModuleId, LucideIcon> = {
    home: Home,
 bilibili: AudioLines,
    discover: Compass,
    search: Search,
    local: FolderOpen,
    library: Library,
    radios: Podcast,
    stats: BarChart3,
}

const MODE_ICONS = {
    netease: Music2,
 bilibili: AudioLines,
} as const

type LayoutRow = WorkspaceLayoutItem & WorkspaceModule

function LayoutTab() {
    const {
        mode,
        layoutItems,
        setMode,
        reorderModules,
        setModuleVisible,
        resetLayout,
    } = useFrontendMode()
    const [announcement, setAnnouncement] = useState("")
    const definitions = WORKSPACE_MODULES[mode]
    const rows: LayoutRow[] = layoutItems.map((item) => {
        const definition =
            definitions.find((candidate) => candidate.id === item.id) ??
            definitions[0]
        return {
            ...item,
            id: item.id,
            label: definition?.label ?? item.id,
            description: definition?.description ?? "",
        }
    })

    function handleVisibilityChange(item: LayoutRow, visible: boolean) {
        if (!setModuleVisible(item.id, visible)) {
            notifyWarning("至少保留一个组件", {
                description: "当前模式的工作区不能完全隐藏",
            })
            return
        }
        notifySuccess(visible ? "已显示组件" : "已隐藏组件", {
            description: item.label,
        })
    }

    function handleReset() {
        resetLayout()
        notifySuccess("已恢复默认布局", {
            description:
                mode === "bilibili" ? "B站模式" : "网易云模式",
        })
    }

    return (
        <div className="space-y-3">
            <TabHeader
                title="布局"
                description="选择前端模式，并拖动组件调整显示顺序"
            />

            <SettingsGroup
                title="前端模式"
                description="两套模式分别保存自己的组件布局"
            >
                <div
                    role="group"
                    aria-label="前端模式"
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                    {FRONTEND_MODE_OPTIONS.map((option) => {
                        const Icon = MODE_ICONS[option.id]
                        const active = mode === option.id
                        return (
                            <button
                                key={option.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setMode(option.id)}
                                className={cn(
                                    "flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left",
                                    "transition-[border-color,background-color,transform]",
                                    "active:scale-[0.99] active:duration-[var(--duration-press)]",
                                    "focus-visible:outline-2 focus-visible:outline-ring",
 active
 ? "border-primary bg-[var(--surface-fill-hover)]"
                                        : "border-[var(--border)] bg-[var(--surface-fill)] hover:bg-[var(--surface-fill-hover)]",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
 "bg-primary/10 text-primary",
                                    )}
                                >
                                    <Icon
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-[14px] font-semibold">
                                        {option.label}
                                        {active ? (
                                            <span className="rounded-full bg-[var(--surface-fill-hover)] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                使用中
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                                        {option.description}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            </SettingsGroup>

            <SettingsGroup
                title="当前模式组件"
                description="拖动左侧手柄排序，鼠标与 Alt + ↑/↓ 都可用"
                className="min-w-0"
            >
                <DragList
                    items={rows}
                    enabled
                    itemHeight={78}
                    onReorder={(next) => {
                        reorderModules(
                            next.map((item) => ({
                                id: item.id,
                                visible: item.visible,
                            })),
                        )
                        setAnnouncement("组件顺序已更新")
                    }}
                    className="min-w-0"
                    renderItem={(item, _index, handle) => {
                        const Icon = MODULE_ICONS[item.id]
                        return (
                            <div
                                className={cn(
                                    "flex h-[74px] min-w-0 items-center gap-2 rounded-xl px-1.5",
                                    "transition-opacity",
                                    !item.visible && "opacity-55",
                                )}
                            >
                                {handle}
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-fill)] text-muted-foreground">
                                    <Icon
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <label
                                    htmlFor={`workspace-visible-${mode}-${item.id}`}
                                    className="min-w-0 flex-1 cursor-pointer"
                                >
                                    <span className="block truncate text-[13px] font-medium">
                                        {item.label}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                                        {item.description}
                                    </span>
                                </label>
                                <span className="flex shrink-0 items-center gap-2">
                                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                                        {item.visible ? "显示" : "隐藏"}
                                    </span>
                                    <Switch
                                        id={`workspace-visible-${mode}-${item.id}`}
                                        checked={item.visible}
                                        onCheckedChange={(checked) =>
                                            handleVisibilityChange(
                                                item,
                                                checked,
                                            )
                                        }
                                        aria-label={`${item.visible ? "隐藏" : "显示"}${item.label}`}
                                    />
                                </span>
                            </div>
                        )
                    }}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="text-[12px] text-muted-foreground">
                        隐藏的组件不会出现在侧栏与移动端导航中
                    </p>
                    <ActionButton onClick={handleReset}>
                        恢复默认布局
                    </ActionButton>
                </div>
            </SettingsGroup>
            <p className="sr-only" aria-live="polite">
                {announcement}
            </p>
        </div>
    )
}

export { LayoutTab }
