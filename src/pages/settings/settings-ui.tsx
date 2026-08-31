import type { ButtonHTMLAttributes, ReactNode } from "react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

// 设置页统一的布局组件：页头 + 分组卡片 + 横向卡片 + 选择 chip + 滑块 + 开关行。
// 各 tab 只负责数据与回调，布局交给这里，避免零散 material-panel 堆叠。
// 密度约定：行 min-h-11、分组间距 gap-3、卡片内边距 px-4 py-3.5。

function TabHeader({
    title,
    description,
}: {
    title: string
    description?: string
}) {
    return (
        <div className="px-0.5">
            <h2 className="text-[20px] font-bold tracking-[-0.03em] text-foreground">
                {title}
            </h2>
            {description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                    {description}
                </p>
            ) : null}
        </div>
    )
}

function SettingsGroup({
    title,
    description,
    className,
    children,
}: {
    title?: string
    description?: string
    className?: string
    children: ReactNode
}) {
    return (
        <div
            className={cn(
                "material-panel space-y-3 rounded-[20px] px-4 py-3.5",
                className,
            )}
        >
            {title ? (
                <div>
                    <p className="text-[15px] font-medium tracking-[-0.01em]">
                        {title}
                    </p>
                    {description ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
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
    className,
    children,
}: {
    title?: string
    description?: string
    className?: string
    children: ReactNode
}) {
    return (
        <div
            className={cn(
                "material-panel flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-4 py-3.5",
                className,
            )}
        >
            {title ? (
                <div className="min-w-0">
                    <p className="text-[15px] font-medium tracking-[-0.01em]">
                        {title}
                    </p>
                    {description ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            ) : null}
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
                "cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium transition-[color,background-color,transform]",
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

function ChipRow({
    className,
    children,
}: {
    className?: string
    children: ReactNode
}) {
    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {children}
        </div>
    )
}

// 「标签 + 描述在左，一排 chip 在右」的行级布局，语义相近的选项合并在同一分组里复用
function ChoiceRow({
    label,
    description,
    className,
    children,
}: {
    label: string
    description?: string
    className?: string
    children: ReactNode
}) {
    return (
        <div
            className={cn(
                "flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2",
                className,
            )}
        >
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            <ChipRow>{children}</ChipRow>
        </div>
    )
}

type ActionButtonVariant = "default" | "primary" | "ghost" | "danger"

const ACTION_BUTTON_VARIANTS: Record<ActionButtonVariant, string> = {
    default:
        "bg-[var(--surface-fill)] text-foreground hover:bg-[var(--surface-fill-hover)]",
    primary: "bg-foreground text-background hover:opacity-90",
    ghost: "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground",
    danger:
        "bg-red-500/12 text-red-600 hover:bg-red-500/20 dark:text-red-400",
}

// 统一的圆角操作按钮：普通、主操作、弱化、确认/危险态
function ActionButton({
    variant = "default",
    icon,
    className,
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ActionButtonVariant
    icon?: ReactNode
}) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-[background-color,color,opacity,transform]",
                "active:scale-[0.97] active:duration-[var(--duration-press)] disabled:cursor-not-allowed disabled:opacity-45",
                ACTION_BUTTON_VARIANTS[variant],
                className,
            )}
        >
            {icon}
            {children}
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
            <div className="flex items-center justify-between text-[13px] text-muted-foreground">
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
        <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[14px] font-medium tracking-[-0.01em]">
                    {title}
                </p>
                {description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
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

export {
    ActionButton,
    ChoiceChip,
    ChoiceRow,
    ChipRow,
    SettingsCard,
    SettingsGroup,
    SliderField,
    SwitchRow,
    TabHeader,
}
