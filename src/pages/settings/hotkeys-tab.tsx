import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"

import {
    DEFAULT_SHORTCUTS,
    SHORTCUT_ACTIONS,
    formatShortcut,
    keydownToShortcut,
    loadGlobalShortcuts,
    updateGlobalShortcut,
    type ShortcutAction,
} from "@/lib/app/global-shortcut-prefs"
import {
    IN_APP_ACTIONS,
    getInAppShortcuts,
    keydownToInAppShortcut,
    setInAppShortcut,
    type InAppShortcutAction,
    type InAppShortcutMap,
} from "@/lib/app/in-app-shortcut-prefs"
import {
    notifyError,
    notifySuccess,
    notifyWarning,
} from "@/lib/notify"
import { isMacOS } from "@/lib/platform"
import { SettingsGroup, TabHeader } from "@/pages/settings/settings-ui"
import { cn } from "@/lib/utils"

function HotkeysTab() {
    const [globalShortcuts, setGlobalShortcuts] = useState<
        Record<ShortcutAction, string>
    >(() => ({ ...DEFAULT_SHORTCUTS }))
    const [inAppShortcuts, setInAppShortcuts] = useState<InAppShortcutMap>(
        () => getInAppShortcuts(),
    )
    const [recording, setRecording] = useState<{
        kind: "global" | "in-app"
        id: string
    } | null>(null)

    useEffect(() => {
        let cancelled = false
        void loadGlobalShortcuts().then((loaded) => {
            if (!cancelled) {
                setGlobalShortcuts(loaded)
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function saveGlobalShortcut(action: ShortcutAction, combo: string) {
        setRecording(null)
        try {
            await updateGlobalShortcut(action, combo)
            setGlobalShortcuts((prev) => ({ ...prev, [action]: combo }))
            notifySuccess(
                combo ? "全局快捷键已更新" : "已关闭该快捷键",
                { description: combo || "该动作不再响应全局按键" },
            )
        } catch (error) {
            notifyError("设置失败", {
                description:
                    error instanceof Error
                        ? error.message
                        : "组合键可能已被占用",
            })
        }
    }

    function saveInAppShortcut(action: InAppShortcutAction, combo: string) {
        setRecording(null)
        setInAppShortcuts((prev) => ({ ...prev, [action]: combo }))
        setInAppShortcut(action, combo)
        notifySuccess(
            combo ? "应用内快捷键已更新" : "已关闭该快捷键",
            { description: combo || "该动作不再响应按键" },
        )
    }

    useEffect(() => {
        if (!recording) {
            return
        }
        const target = recording
        function onKeyDown(event: KeyboardEvent) {
            event.preventDefault()
            event.stopPropagation()
            if (event.key === "Escape") {
                setRecording(null)
                return
            }
            if (event.key === "Backspace" || event.key === "Delete") {
                if (target.kind === "global") {
                    void saveGlobalShortcut(
                        target.id as ShortcutAction,
                        "",
                    )
                } else {
                    saveInAppShortcut(
                        target.id as InAppShortcutAction,
                        "",
                    )
                }
                return
            }
            const combo =
                target.kind === "global"
                    ? keydownToShortcut(event)
                    : keydownToInAppShortcut(event)
            if (!combo) {
                return
            }
            if (target.kind === "global") {
                // 冲突检测：同一组合不能绑到两个全局动作
                const conflict = SHORTCUT_ACTIONS.find(
                    (item) =>
                        item.id !== target.id &&
                        globalShortcuts[item.id] === combo,
                )
                if (conflict) {
                    notifyWarning("组合键冲突", {
                        description: `「${conflict.label}」已使用 ${combo}`,
                    })
                    setRecording(null)
                    return
                }
                void saveGlobalShortcut(target.id as ShortcutAction, combo)
            } else {
                const conflict = IN_APP_ACTIONS.find(
                    (item) =>
                        item.id !== target.id &&
                        inAppShortcuts[item.id] === combo,
                )
                if (conflict) {
                    notifyWarning("组合键冲突", {
                        description: `「${conflict.label}」已使用 ${combo}`,
                    })
                    setRecording(null)
                    return
                }
                saveInAppShortcut(target.id as InAppShortcutAction, combo)
            }
        }
        window.addEventListener("keydown", onKeyDown, true)
        return () => window.removeEventListener("keydown", onKeyDown, true)
    }, [recording, globalShortcuts, inAppShortcuts])

    return (
        <div className="space-y-3">
            <TabHeader
                title="快捷键"
                description="全局与应用内快捷键均支持自定义"
            />

            <div className="space-y-3">
                <SettingsGroup
                    title="全局快捷键"
                    description={
                        isMacOS()
                            ? "默认关闭，避免抢占系统按键；自定义时需含 ⌘/⌥/⌃"
                            : "任何应用下生效，需含 Ctrl/Alt/Super 修饰或 F 键"
                    }
                >
                    <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                        {SHORTCUT_ACTIONS.map((item) => (
                            <ShortcutRow
                                key={`global-${item.id}`}
                                label={item.label}
                                value={globalShortcuts[item.id]}
                                active={
                                    recording?.kind === "global" &&
                                    recording.id === item.id
                                }
                                onStart={() =>
                                    setRecording({
                                        kind: "global",
                                        id: item.id,
                                    })
                                }
                            />
                        ))}
                    </div>
                </SettingsGroup>

                <SettingsGroup
                    title="应用内快捷键"
                    description="窗口聚焦时生效"
                >
                    <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                        {IN_APP_ACTIONS.map((item) => (
                            <ShortcutRow
                                key={`in-app-${item.id}`}
                                label={item.label}
                                value={inAppShortcuts[item.id]}
                                active={
                                    recording?.kind === "in-app" &&
                                    recording.id === item.id
                                }
                                onStart={() =>
                                    setRecording({
                                        kind: "in-app",
                                        id: item.id,
                                    })
                                }
                            />
                        ))}
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                        录制时按 Esc 取消、按退格清除；输入框聚焦时应用内快捷键不生效
                    </p>
                </SettingsGroup>
            </div>
        </div>
    )
}

function ShortcutRow({
    label,
    value,
    active,
    onStart,
}: {
    label: string
    value: string
    active: boolean
    onStart: () => void
}) {
    return (
        <div
            className={cn(
                "flex items-center justify-between gap-3 rounded-xl px-2 py-2.5",
                active && "bg-[var(--surface-fill)]",
            )}
        >
            <span className="text-sm text-foreground/90">{label}</span>
            {active ? (
                <span className="text-[13px] font-medium text-primary">
                    按下组合键…（Esc 取消，退格清除）
                </span>
            ) : (
                <button
                    type="button"
                    onClick={onStart}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--surface-fill)]"
                    title="点击修改"
                >
                    {value ? (
                        <kbd className="glass-chip rounded-lg px-2 py-0.5 font-mono text-[13px] text-foreground/80">
                            {formatShortcut(value)}
                        </kbd>
                    ) : (
                        <span className="text-[13px] text-muted-foreground">
                            未设置
                        </span>
                    )}
                    <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
            )}
        </div>
    )
}

export { HotkeysTab }
