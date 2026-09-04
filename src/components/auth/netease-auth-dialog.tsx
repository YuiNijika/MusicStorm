import { useEffect, useRef, useState } from "react"

import { useQrLogin } from "@/hooks/use-qr-login"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { loginWithEmail } from "@/lib/netease/auth-email"
import { loginWithCellphone, sendCaptcha } from "@/lib/netease/auth-phone"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import { formatError, notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

function isMobile(): boolean {
    try {
        return /android|iphone|ipad|mobile/i.test(navigator.userAgent)
    } catch {
        return false
    }
}

type AuthTab = "phone" | "qr" | "email"

const DEFAULT_TAB: AuthTab = isMobile() ? "phone" : "qr"
const TAB_ORDER: [AuthTab, string][] = isMobile()
    ? [["phone", "手机号"], ["qr", "扫码"], ["email", "邮箱"]]
    : [["qr", "扫码"], ["phone", "手机号"], ["email", "邮箱"]]

type NeteaseAuthDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

function NeteaseAuthDialog({ open, onOpenChange }: NeteaseAuthDialogProps) {
    const { refresh } = useNeteaseSession()
    const [tab, setTab] = useState<AuthTab>(DEFAULT_TAB)
    const [phone, setPhone] = useState("")
    const [captcha, setCaptcha] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [sending, setSending] = useState(false)
    const [loggingIn, setLoggingIn] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const [error, setError] = useState<string | null>(null)
    // 同步守卫 state 更新是异步的，移动端快速双击会读到旧值触发两次发送
    const sendingRef = useRef(false)
    const loggingInRef = useRef(false)

    const handleSuccess = async () => {
        await refresh()
        notifySuccess("登录成功")
        onOpenChange(false)
    }

    const { qrState, startQrLogin, reset } = useQrLogin(handleSuccess)

    useEffect(() => {
        if (!open) {
            reset()
            setError(null)
            setTab(DEFAULT_TAB)
            return
        }
    }, [open, reset])

    useEffect(() => {
        if (open && tab === "qr" && qrState.kind === "idle") {
            void startQrLogin()
        }
    }, [open, tab, qrState.kind, startQrLogin])

    useEffect(() => {
        if (cooldown <= 0) {
            return
        }
        const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
        return () => window.clearTimeout(id)
    }, [cooldown])

    async function handleSendCaptcha() {
        if (sendingRef.current || cooldown > 0) {
            return
        }
        setError(null)
        if (!/^\d{11}$/.test(phone.trim())) {
            const message = "请输入 11 位手机号"
            setError(message)
            notifyError("验证码发送失败", { description: message })
            return
        }
        sendingRef.current = true
        setSending(true)
        try {
            await sendCaptcha(phone)
            setCooldown(60)
            notifySuccess("验证码已发送")
        } catch (err) {
            const message = formatError(err) || "验证码发送失败"
            setError(message)
            notifyError("验证码发送失败", { description: message })
        } finally {
            sendingRef.current = false
            setSending(false)
        }
    }

    async function handleLogin() {
        if (loggingInRef.current) {
            return
        }
        setError(null)
        if (!/^\d{11}$/.test(phone.trim())) {
            const message = "请输入 11 位手机号"
            setError(message)
            notifyError("登录失败", { description: message })
            return
        }
        if (!captcha.trim()) {
            const message = "请输入验证码"
            setError(message)
            notifyError("登录失败", { description: message })
            return
        }
        loggingInRef.current = true
        setLoggingIn(true)
        try {
            await loginWithCellphone({ phone, captcha })
            await handleSuccess()
        } catch (err) {
            const message = formatError(err) || "登录失败"
            setError(message)
            notifyError("登录失败", { description: message })
        } finally {
            loggingInRef.current = false
            setLoggingIn(false)
        }
    }

    async function handleEmailLogin() {
        if (loggingInRef.current) {
            return
        }
        setError(null)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            const message = "请输入正确的邮箱"
            setError(message)
            notifyError("登录失败", { description: message })
            return
        }
        if (!password) {
            const message = "请输入密码"
            setError(message)
            notifyError("登录失败", { description: message })
            return
        }
        loggingInRef.current = true
        setLoggingIn(true)
        try {
            await loginWithEmail({ email, password })
            await handleSuccess()
        } catch (err) {
            const message = formatError(err) || "登录失败"
            setError(message)
            notifyError("登录失败", { description: message })
        } finally {
            loggingInRef.current = false
            setLoggingIn(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" showCloseButton>
                <DialogHeader>
                    <DialogTitle>登录网易云</DialogTitle>
                    <DialogDescription>
                        登录状态存储在本地
                    </DialogDescription>
                </DialogHeader>

                <div className="material-segmented flex gap-1 rounded-full p-1">
                    {TAB_ORDER.map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                setTab(id)
                                setError(null)
                            }}
                            className={cn(
                                "flex-1 cursor-pointer rounded-full py-1.5 text-[12px] font-medium transition-colors",
                                tab === id
                                    ? "bg-background shadow-sm"
                                    : "text-muted-foreground",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {tab === "phone" ? (
                    <div className="space-y-3">
                        <input
                            value={phone}
                            onChange={(event) => setPhone(event.currentTarget.value)}
                            placeholder="手机号"
                            inputMode="numeric"
                            className="material-field h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                        />
                        <div className="flex gap-2">
                            <input
                                value={captcha}
                                onChange={(event) => setCaptcha(event.currentTarget.value)}
                                placeholder="验证码"
                                inputMode="numeric"
                                className="material-field h-10 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none"
                            />
                            <button
                                type="button"
                                disabled={sending || cooldown > 0}
                                onClick={() => void handleSendCaptcha()}
                                className="h-10 shrink-0 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                            >
                                {cooldown > 0 ? `${cooldown}s` : sending ? "发送中" : "获取验证码"}
                            </button>
                        </div>
                        <button
                            type="button"
                            disabled={loggingIn}
                            onClick={() => void handleLogin()}
                            className="h-10 w-full cursor-pointer rounded-full bg-foreground text-[13px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.98] active:duration-[var(--duration-press)] disabled:opacity-50"
                        >
                            {loggingIn ? "登录中…" : "登录"}
                        </button>
                    </div>
                ) : tab === "email" ? (
                    <div className="space-y-3">
                        <input
                            value={email}
                            onChange={(event) => setEmail(event.currentTarget.value)}
                            placeholder="邮箱"
                            inputMode="email"
                            autoComplete="email"
                            className="material-field h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                        />
                        <input
                            value={password}
                            onChange={(event) => setPassword(event.currentTarget.value)}
                            placeholder="密码"
                            type="password"
                            autoComplete="current-password"
                            className="material-field h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                        />
                        <button
                            type="button"
                            disabled={loggingIn}
                            onClick={() => void handleEmailLogin()}
                            className="h-10 w-full cursor-pointer rounded-full bg-foreground text-[13px] font-medium text-background transition-[transform,opacity] hover:opacity-92 active:scale-[0.98] active:duration-[var(--duration-press)] disabled:opacity-50"
                        >
                            {loggingIn ? "登录中…" : "登录"}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 py-2">
                        <div className="flex size-[180px] items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-black/40">
                            {qrState.kind === "waiting" && qrState.qrimg ? (
                                <img
                                    src={qrState.qrimg}
                                    alt="登录二维码"
                                    loading="lazy"
                                    decoding="async"
                                    className="size-full object-contain p-1"
                                />
                            ) : (
                                <span className="px-3 text-center text-[12px] text-muted-foreground">
                                    {qrState.kind === "loading"
                                        ? "生成中…"
                                        : qrState.kind === "error"
                                          ? qrState.message
                                          : "准备二维码"}
                                </span>
                            )}
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                            {qrState.kind === "waiting"
                                ? qrState.hint
                                : qrState.kind === "error"
                                  ? qrState.message
                                  : "使用网易云 App 扫一扫"}
                        </p>
                        <button
                            type="button"
                            onClick={() => void startQrLogin()}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            刷新二维码
                        </button>
                    </div>
                )}

                {error ? (
                    <p className="text-[12px] text-rose-600 dark:text-rose-300">{error}</p>
                ) : null}

                <button
                    type="button"
                    onClick={() => void openNeteaseRegister()}
                    className="text-left text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                >
                    没有账号？去网易云注册
                </button>
            </DialogContent>
        </Dialog>
    )
}

export { NeteaseAuthDialog }