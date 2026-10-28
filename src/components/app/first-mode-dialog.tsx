import { AudioLines, Check, Music2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    FRONTEND_MODE_OPTIONS,
    type FrontendMode,
} from "@/lib/frontend-mode"
import { cn } from "@/lib/utils"

const MODE_ICONS = {
    netease: Music2,
    bilibili: AudioLines,
} as const

type FirstModeDialogProps = {
    mode: FrontendMode
    onSelect: (mode: FrontendMode) => void
}

function FirstModeDialog({ mode, onSelect }: FirstModeDialogProps) {
    const [selectedMode, setSelectedMode] = useState<FrontendMode>(mode)

    return (
        <Dialog open onOpenChange={() => { }}>
            <DialogContent
                className="max-w-lg gap-6"
                showCloseButton={false}
            >
                <DialogHeader className="pr-6">
                    <DialogTitle>选择默认模式</DialogTitle>
                    <DialogDescription>
                        选择你常用的音乐来源。之后可在设置中的“布局”随时修改。
                    </DialogDescription>
                </DialogHeader>
                <div
                    className="grid gap-3 sm:grid-cols-2"
                    role="radiogroup"
                    aria-label="默认模式"
                >
                    {FRONTEND_MODE_OPTIONS.map((option) => {
                        const Icon = MODE_ICONS[option.id]
                        const selected = selectedMode === option.id
                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setSelectedMode(option.id)}
                                className={cn(
                                    "flex min-h-32 flex-col items-start gap-4 rounded-2xl border p-4 text-left",
                                    "transition-[border-color,background-color,transform] active:scale-[0.99]",
                                    "focus-visible:outline-2 focus-visible:outline-ring",
                                    selected
                                        ? "border-primary bg-[var(--surface-fill-hover)]"
                                        : "border-[var(--border)] bg-[var(--surface-fill)] hover:bg-[var(--surface-fill-hover)]",
                                )}
                            >
                                <span className="flex w-full items-center justify-between">
                                    <span
                                        className={cn(
                                            "flex size-10 items-center justify-center rounded-xl",
                                            selected
                                                ? "bg-primary/15 text-primary"
                                                : "bg-[var(--surface-fill-hover)] text-muted-foreground",
                                        )}
                                    >
                                        <Icon
                                            className="size-5"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    {selected ? (
                                        <Check
                                            className="size-4 text-primary"
                                            aria-hidden="true"
                                        />
                                    ) : null}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[15px] font-semibold">
                                        {option.label}
                                    </span>
                                    <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                                        {option.description}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </div>
                <Button
                    type="button"
                    className="w-full"
                    onClick={() => onSelect(selectedMode)}
                >
                    使用{selectedMode === "bilibili" ? "B站" : "网易云"}模式
                </Button>
            </DialogContent>
        </Dialog>
    )
}

export { FirstModeDialog }
