import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    XIcon,
    CircleCheckIcon,
    InfoIcon,
    TriangleAlertIcon,
    OctagonXIcon,
    Loader2Icon,
} from "lucide-react"

// 全局唯一 manager；notify.ts 与 Toaster 必须共用同一实例
const toast = ToastPrimitive.createToastManager()

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
    return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
    return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
    return (
        <ToastPrimitive.Viewport
            data-slot="toast-viewport"
            className={cn(
                // 播放栏之上，流式堆叠
                "pointer-events-none fixed inset-x-4 bottom-24 z-[200] mx-auto flex w-auto max-w-sm flex-col-reverse gap-2 outline-none",
                "sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
                className,
            )}
            {...props}
        />
    )
}

// 相对定位 + 内容撑高；不依赖 --toast-height / absolute 叠放
function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
    return (
        <ToastPrimitive.Root
            data-slot="toast"
            className={cn(
                "group/toast pointer-events-auto relative w-full origin-bottom",
                "rounded-2xl border border-black/[0.08] bg-popover text-popover-foreground shadow-lg outline-none",
                "dark:border-white/[0.1] dark:bg-zinc-900/95",
                "min-h-[3.25rem] backdrop-blur-xl",
                // 入场/退场动画在 Style.css：[data-slot="toast"] 材质化入场，
                // data-limited 走对称退场，由 Base UI 等 transition 结束再卸载
                className,
            )}
            {...props}
        />
    )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
    return (
        <ToastPrimitive.Content
            data-slot="toast-content"
            className={cn(
                // 始终可读；不依赖 expanded 才显示
                "flex items-start gap-3 p-3.5 sm:p-4",
                className,
            )}
            {...props}
        />
    )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
    return (
        <ToastPrimitive.Title
            data-slot="toast-title"
            className={cn("text-[13px] font-semibold leading-snug", className)}
            {...props}
        />
    )
}

function ToastDescription({
    className,
    ...props
}: ToastPrimitive.Description.Props) {
    return (
        <ToastPrimitive.Description
            data-slot="toast-description"
            className={cn(
                "text-[12px] leading-snug text-muted-foreground",
                className,
            )}
            {...props}
        />
    )
}

function ToastAction({
    className,
    render = <Button variant="outline" size="sm" />,
    ...props
}: ToastPrimitive.Action.Props) {
    return (
        <ToastPrimitive.Action
            data-slot="toast-action"
            render={render}
            className={cn("shrink-0", className)}
            {...props}
        />
    )
}

function ToastClose({
    className,
    children,
    render = <Button variant="ghost" size="icon-sm" />,
    ...props
}: ToastPrimitive.Close.Props) {
    return (
        <ToastPrimitive.Close
            data-slot="toast-close"
            aria-label="Close toast"
            render={render}
            className={cn(
                "relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
                className,
            )}
            {...props}
        >
            {children ?? <XIcon aria-hidden="true" />}
        </ToastPrimitive.Close>
    )
}

function ToastIcon({ type }: { type: string | undefined }) {
    let icon: React.ReactNode = null

    if (type === "success") {
        icon = <CircleCheckIcon className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
    } else if (type === "info") {
        icon = <InfoIcon className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
    } else if (type === "warning") {
        icon = <TriangleAlertIcon className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
    } else if (type === "error") {
        icon = <OctagonXIcon className="text-destructive" aria-hidden="true" />
    } else if (type === "loading") {
        icon = <Loader2Icon className="animate-spin text-muted-foreground" aria-hidden="true" />
    }

    if (!icon) {
        return null
    }

    return (
        <span
            data-slot="toast-icon"
            className="mt-0.5 shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
        >
            {icon}
        </span>
    )
}

function ToastList() {
    const { toasts } = ToastPrimitive.useToastManager()

    return toasts.map((toastItem) => (
        <Toast key={toastItem.id} toast={toastItem}>
            <ToastContent>
                <ToastIcon type={toastItem.type} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-1">
                    <ToastTitle />
                    <ToastDescription />
                </div>
                {toastItem.actionProps ? <ToastAction /> : null}
                <ToastClose />
            </ToastContent>
        </Toast>
    ))
}

function Toaster({
    children,
    toastManager = toast,
    ...props
}: ToastPrimitive.Provider.Props) {
    return (
        <ToastProvider toastManager={toastManager} limit={4} timeout={4000} {...props}>
            {children}
            <ToastPortal>
                <ToastViewport>
                    <ToastList />
                </ToastViewport>
            </ToastPortal>
        </ToastProvider>
    )
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export {
    Toaster,
    Toast,
    ToastAction,
    ToastClose,
    ToastContent,
    ToastDescription,
    ToastPortal,
    ToastProvider,
    ToastTitle,
    ToastViewport,
    createToastManager,
    toast,
    useToastManager,
}