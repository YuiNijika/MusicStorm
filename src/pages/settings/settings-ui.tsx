import type { ReactNode } from "react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

// 设置页统一的布局组件：分组卡片 + 横向卡片 + 选择 chip + 滑块 + 开关行。
// 各 tab 只负责数据与回调，布局交给这里，避免零散 material-panel 堆叠。

function SettingsGroup({
    title,
    description,
    children,
}: {
    title?: string
    description?: string
    children: ReactNode
}) {
    return (
        <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
            {title ? (
                <div>
                    <p className="text-[14px] font-medium tracking-[-0.01em]">
                        {title}
                    </p>
                    {description ? (
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            ) : null}
            {children}
        </div>
    )
}

function SettingsCard({
    title,
    description,
    children,
}: {
    title: string
    description: string
    children: ReactNode
}) {
    return (
        <div className="material-panel flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-[14px] font-medium tracking-[-0.01em]">
                    {title}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {description}
                </p>
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}

function ChoiceChip({
    label,
    active,
    onClick,
}: {
    label: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-[color,background-color,transform]",
                "active:scale-[0.97] active:duration-[var(--duration-press)]",
                active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
            )}
        >
            {label}
        </button>
    )
}

function SliderField({
    label,
    display,
    min,
    max,
    step,
    value,
    disabled,
    onChange,
}: {
    label: string
    display?: string
    min: number
    max: number
    step: number
    value: number
    disabled?: boolean
    onChange: (value: number) => void
}) {
    return (
        <label className="block space-y-2">
            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums">{display ?? value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(Number(event.currentTarget.value))}
                className="progress-range w-full disabled:opacity-40"
                aria-label={label}
            />
        </label>
    )
}

function SwitchRow({
    title,
    description,
    checked,
    disabled,
    onCheckedChange,
}: {
    title: string
    description?: string
    checked: boolean
    disabled?: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[14px] font-medium tracking-[-0.01em]">
                    {title}
                </p>
                {description ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            <Switch
                checked={checked}
                disabled={disabled}
                onCheckedChange={onCheckedChange}
                aria-label={title}
            />
        </div>
    )
}

export { ChoiceChip, SettingsCard, SettingsGroup, SliderField, SwitchRow }
