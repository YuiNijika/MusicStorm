import * as React from "react"
import { useEffect, useState, type CSSProperties } from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    TOAST_PREFS_EVENT,
    readToastPrefs,
    type ToastPrefs,
} from "@/lib/appearance/toast-prefs"
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

// Toast 位置/边距偏好（外观设置可调，默认右下）
function useToastPrefs(): ToastPrefs {
    const [prefs, setPrefs] = useState<ToastPrefs>(() => readToastPrefs())

    useEffect(() => {
        function sync() {
            setPrefs(readToastPrefs())
        }
        window.addEventListener(TOAST_PREFS_EVENT, sync)
        return () => {
            window.removeEventListener(TOAST_PREFS_EVENT, sync)
        }
    }, [])

    return prefs
}

function toastViewportStyle(prefs: ToastPrefs): CSSProperties {
    const m = prefs.margin
    switch (prefs.position) {
        case "top-right":
            return { top: m, right: m }
        case "top-center":
            return { top: m, left: "50%", transform: "translateX(-50%)" }
        case "bottom-center":
            return { bottom: m, left: "50%", transform: "translateX(-50%)" }
        default:
            return { bottom: m, right: m }
    }
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
    const prefs = useToastPrefs()
    const isMobile = useIsMobile()
    // 移动端固定顶部居中：底部为播放条与全屏播放器控区，通知更不易被遮挡
    const position = isMobile ? "top-center" : prefs.position
    const centered =
        position === "top-center" || position === "bottom-center"

    return (
        <ToastPrimitive.Viewport
            data-slot="toast-viewport"
            className={cn(
                "pointer-events-none fixed z-[200] flex max-w-sm flex-col-reverse gap-2 outline-none",
                "w-[min(92vw,24rem)]",
                !centered && "sm:w-full",
                className,
            )}
            style={{
                ...toastViewportStyle({ position, margin: prefs.margin }),
                ...props.style,
            }}
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
                "backdrop-blur-xl",
                // 入场/退场动画在 Style.css：[data-slot="toast"] 材质化入场，
                // data-limited 走对称退场，由 Base UI 等 transition 结束再卸载
                className,
            )}
            {...props}
        />
    )
}

function ToastContent({
    className,
    compact,
    ...props
}: ToastPrimitive.Content.Props & { compact?: boolean }) {
    return (
        <ToastPrimitive.Content
            data-slot="toast-content"
            className={cn(
                "flex items-center",
                compact ? "gap-2 px-3 py-2 sm:px-3.5 sm:py-2.5" : "gap-3 p-3.5 sm:p-4",
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
        // 未指定类型时回退 info 图标，避免呈现成无图标的 Default 观感
        icon = <InfoIcon className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
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
                <ToastContent compact={!toastItem.description}>
                    <ToastIcon type={toastItem.type} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-1">
                        <ToastTitle />
                        {toastItem.description ? <ToastDescription /> : null}
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