import { useEffect, useState, type ReactNode } from "react"
import { Check, LogOut, Minimize2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { getCloseToTray } from "@/lib/app/close-to-tray-prefs"
import type { CloseAction } from "@/hooks/use-close-to-tray"
import { isMacOS } from "@/lib/platform"
import { cn } from "@/lib/utils"

type CloseConfirmDialogProps = {
    open: boolean
    onConfirm: (action: CloseAction, noAsk: boolean) => void
    onCancel: () => void
}

// 关闭窗口前的行为确认框：动作单选跟随设置当前值，勾选「不再提示」
// 后由 use-close-to-tray 写回偏好，与设置页两个开关双向同步。
function CloseConfirmDialog({
    open,
    onConfirm,
    onCancel,
}: CloseConfirmDialogProps) {
    const [action, setAction] = useState<CloseAction>(() =>
        getCloseToTray() ? "tray" : "exit",
    )
    const [noAsk, setNoAsk] = useState(false)
    const trayLabel = isMacOS() ? "保留在菜单栏" : "最小化到系统托盘"

    // 每次打开时重置为设置当前值，设置页改过也能反映到默认选中
    useEffect(() => {
        if (open) {
            setAction(getCloseToTray() ? "tray" : "exit")
            setNoAsk(false)
        }
    }, [open])

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    onCancel()
                }
            }}
        >
            <DialogContent showCloseButton={false} className="sm:max-w-[22rem]">
                <DialogHeader>
                    <DialogTitle>关闭 MusicStorm？</DialogTitle>
                    <DialogDescription>
                        选择关闭窗口后的行为，音乐仍会继续播放
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                    <OptionButton
                        active={action === "tray"}
                        onClick={() => setAction("tray")}
                        icon={<Minimize2 />}
                        label={trayLabel}
                        note={
                            isMacOS()
                                ? "音乐继续播放，从菜单栏图标恢复"
                                : "音乐继续播放，从系统托盘恢复"
                        }
                    />
                    <OptionButton
                        active={action === "exit"}
                        onClick={() => setAction("exit")}
                        icon={<LogOut />}
                        label="退出应用"
                        note="停止播放并关闭应用"
                    />
                </div>

                <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                        checked={noAsk}
                        onCheckedChange={(checked) => setNoAsk(Boolean(checked))}
                    />
                    <span className="text-[13px] text-foreground/90">
                        不再提示，下次直接执行
                    </span>
                </label>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        取消
                    </Button>
                    <Button onClick={() => onConfirm(action, noAsk)}>确定</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function OptionButton({
    active,
    onClick,
    icon,
    label,
    note,
}: {
    active: boolean
    onClick: () => void
    icon: ReactNode
    label: string
    note: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left",
                "transition-[background-color,border-color] duration-[var(--duration-control)]",
                "active:scale-[0.99] active:duration-[var(--duration-press)]",
                active
                    ? "border-primary/35 bg-primary/5"
                    : "border-[var(--separator)] hover:bg-[var(--surface-fill-hover)]",
            )}
        >
            <span
                className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    active
                        ? "bg-primary/12 text-primary"
                        : "bg-[var(--surface-fill)] text-foreground/60",
                )}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">
                    {label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                    {note}
                </span>
            </span>
            {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
        </button>
    )
}

export { CloseConfirmDialog }
