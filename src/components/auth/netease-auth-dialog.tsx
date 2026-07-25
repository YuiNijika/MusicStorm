import { useEffect, useState } from "react"

import { useQrLogin } from "@/hooks/use-qr-login"
import { useNeteaseSession } from "@/hooks/use-netease-session"
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

type AuthTab = "phone" | "qr"

type NeteaseAuthDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

function NeteaseAuthDialog({ open, onOpenChange }: NeteaseAuthDialogProps) {
    const { refresh } = useNeteaseSession()
    const [tab, setTab] = useState<AuthTab>("qr")
    const [phone, setPhone] = useState("")
    const [captcha, setCaptcha] = useState("")
    const [sending, setSending] = useState(false)
    const [loggingIn, setLoggingIn] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const [error, setError] = useState<string | null>(null)

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
            setTab("qr")
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
        setError(null)
        if (!/^\d{11}$/.test(phone.trim())) {
            const message = "请输入 11 位手机号"
            setError(message)
            notifyError("验证码发送失败", { description: message })
            return
        }
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
            setSending(false)
        }
    }

    async function handleLogin() {
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
        setLoggingIn(true)
        try {
            await loginWithCellphone({ phone, captcha })
            await handleSuccess()
        } catch (err) {
            const message = formatError(err) || "登录失败"
            setError(message)
            notifyError("登录失败", { description: message })
        } finally {
            setLoggingIn(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" showCloseButton>
                <DialogHeader>
                    <DialogTitle>登录网易云</DialogTitle>
                    <DialogDescription>
                        默认扫码登录到MusicStorm
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                    {(
                        [
                            ["qr", "扫码"],
                            ["phone", "手机号"],
                        ] as const
                    ).map(([id, label]) => (
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
                                className="h-10 shrink-0 cursor-pointer rounded-full bg-black/[0.05] px-3 text-[12px] font-medium disabled:opacity-50 dark:bg-white/[0.08]"
                            >
                                {cooldown > 0 ? `${cooldown}s` : sending ? "发送中" : "获取验证码"}
                            </button>
                        </div>
                        <button
                            type="button"
                            disabled={loggingIn}
                            onClick={() => void handleLogin()}
                            className="h-10 w-full cursor-pointer rounded-full bg-foreground text-[13px] font-medium text-background disabled:opacity-50 active:scale-[0.98]"
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
                            className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium dark:bg-white/[0.08]"
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