import { ArrowLeft, LogOut, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"

import { cn } from "@/lib/utils"
import {
 AUTH_EVENT,
 completeBilibiliLogin,
 completeBilibiliRiskLogin,
 createBilibiliQrLogin,
 fetchBilibiliAuthStatus,
 getBilibiliRiskGeetest,
 loginBilibiliWithPassword,
 loginBilibiliWithSms,
 logoutBilibili,
 pollBilibiliQrLogin,
 saveBilibiliCookie,
 sendBilibiliRiskSms,
 sendBilibiliSmsCode,
 type BilibiliAuthStatus,
 type BilibiliGeetestChallenge,
 type BilibiliRiskLogin,
} from "@/lib/bilibili/auth"
import { GeetestWebView, type GeetestResult } from "@/components/bilibili/geetest-webview"
import { notifyFromError, notifySuccess } from "@/lib/notify"
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog"
import { ActionButton } from "@/pages/settings/settings-ui"

type AuthDialogProps = {
 open: boolean
 onOpenChange: (open: boolean) => void
}

type QrState =
 | { status: "idle" }
 | {
 status: "loading" | "waiting" | "scanned" | "expired" | "failed"
 message?: string
 }

type AuthTab = "password" | "sms" | "qr" | "cookie"

function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
 const [tab, setTab] = useState<AuthTab>("qr")
 const [status, setStatus] = useState<BilibiliAuthStatus>({
 loggedIn: false,
 account: null,
 })
 const [qr, setQr] = useState<{
 url: string
 key: string
 } | null>(null)
 const [qrImageUrl, setQrImageUrl] = useState("")
 const [qrState, setQrState] = useState<QrState>({ status: "idle" })
 const [cookieText, setCookieText] = useState("")
 const [cookieError, setCookieError] = useState("")
 const [loading, setLoading] = useState(false)
 const [username, setUsername] = useState("")
 const [password, setPassword] = useState("")
 const [phone, setPhone] = useState("")
 const [smsCode, setSmsCode] = useState("")
 const [captchaKey, setCaptchaKey] = useState("")
 const [cooldown, setCooldown] = useState(0)
 const [riskLogin, setRiskLogin] = useState<BilibiliRiskLogin | null>(null)
 const [riskChallenge, setRiskChallenge] =
 useState<BilibiliGeetestChallenge | null>(null)
 const [riskCaptchaKey, setRiskCaptchaKey] = useState("")
 const [riskSmsCode, setRiskSmsCode] = useState("")
 const riskSmsBusyRef = useRef(false)

 useEffect(() => {
 if (!open) {
 return
 }
 setTab("qr")
 setCookieText("")
 setUsername("")
 setPassword("")
 setPhone("")
 setSmsCode("")
 setCaptchaKey("")
 setCooldown(0)
 setRiskLogin(null)
 setRiskChallenge(null)
 setRiskCaptchaKey("")
 setRiskSmsCode("")
 riskSmsBusyRef.current = false
 let cancelled = false
 setLoading(true)
 void fetchBilibiliAuthStatus()
 .then((next) => {
 if (!cancelled) {
 setStatus(next)
 }
 })
 .catch(() => undefined)
 .finally(() => {
 if (!cancelled) {
 setLoading(false)
 }
 })
 return () => {
 cancelled = true
 }
 }, [open])

 useEffect(() => {
 if (cooldown <= 0) {
 return
 }
 const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
 return () => window.clearTimeout(timer)
 }, [cooldown])

 const startQrLogin = useCallback(async () => {
 setQrState({ status: "loading" })
 try {
 const session = await createBilibiliQrLogin()
 setQr(session)
 setQrState({ status: "waiting" })
 } catch (error) {
 setQrState({ status: "failed", message: "无法生成登录二维码" })
 notifyFromError("无法生成登录二维码", error)
 }
 }, [])

 useEffect(() => {
 if (!open || tab !== "qr" || qr || qrState.status !== "idle") {
 return
 }
 void startQrLogin()
 }, [open, qr, qrState.status, startQrLogin, tab])

 const isPolling = qrState.status === "waiting" || qrState.status === "scanned"
 useEffect(() => {
 const qrKey = qr?.key
 if (!open || tab !== "qr" || !qrKey || !isPolling) {
 return
 }
  let active = true
  let polling = false
  let completed = false
 const timer = window.setInterval(() => {
        if (!active || polling || completed) {
            return
        }
        polling = true
        void pollBilibiliQrLogin(qrKey)
            .then(async (result) => {
                if (!active || completed) {
                    return
                }
                if (result.status === "confirmed") {
                    completed = true
                    window.clearInterval(timer)
                    const next = await completeBilibiliLogin()
                    setStatus(next)
                    setQrState({ status: "idle" })
                    onOpenChange(false)
                    notifySuccess("B站登录成功", {
                        description: next.account?.name,
                    })
                    return
                }
                setQrState({
                    status: result.status,
                    message: result.message,
                })
            })
            .catch(() => {
                if (!active || completed) {
                    return
                }
                completed = true
                window.clearInterval(timer)
                setQrState({
                    status: "failed",
                    message: "登录状态检查失败，请重试",
                })
            })
            .finally(() => {
                polling = false
            })
 },1600)
  return () => {
      active = false
      window.clearInterval(timer)
  }
  }, [onOpenChange, open, qr?.key, isPolling, tab])

 useEffect(() => {
 if (!qr?.url) {
 setQrImageUrl("")
 return
 }
 let cancelled = false
 setQrImageUrl("")
 void QRCode.toDataURL(qr.url, {
 width: 240,
 margin: 2,
 errorCorrectionLevel: "M",
 color: {
 dark: "#111111",
 light: "#ffffff",
 },
 })
 .then((dataUrl) => {
 if (!cancelled) {
 setQrImageUrl(dataUrl)
 }
 })
 .catch(() => {
 if (!cancelled) {
 setQrImageUrl("")
 }
 })
 return () => {
 cancelled = true
 }
 }, [qr?.url])

 useEffect(() => {
 function sync() {
 void fetchBilibiliAuthStatus().then(setStatus).catch(() => undefined)
 }
 window.addEventListener(AUTH_EVENT, sync)
 return () => window.removeEventListener(AUTH_EVENT, sync)
 }, [])

 async function saveCookie() {
 setLoading(true)
 setCookieError("")
 setRiskCaptchaKey("")
 setRiskSmsCode("")
 try {
 const next = await saveBilibiliCookie(cookieText)
 setStatus(next)
 setCookieText("")
 onOpenChange(false)
 notifySuccess("B站登录成功", {
 description: next.account?.name,
 })
 } catch (error) {
 setCookieError("登录失败，请检查 Cookie 是否完整且仍有效，然后重试。")
 notifyFromError("登录失败", error)
 } finally {
 setLoading(false)
 }
 }

 async function passwordLogin() {
 if (loading) {
 return
 }
 if (!username.trim() || !password) {
 setCookieError("请输入账号和密码")
 return
 }
 setLoading(true)
 setCookieError("")
 setRiskCaptchaKey("")
 setRiskSmsCode("")
 try {
 const result = await loginBilibiliWithPassword(username, password)
 if (result.type === "risk") {
 setRiskLogin(result.risk)
 setRiskChallenge(null)
 setRiskCaptchaKey("")
 setRiskSmsCode("")
 return
 }
 setStatus(result.status)
 onOpenChange(false)
 notifySuccess("B站登录成功", { description: result.status.account?.name })
 } catch (error) {
 setCookieError(error instanceof Error ? error.message : "登录失败")
 notifyFromError("登录失败", error)
 } finally {
 setLoading(false)
 }
 }

 async function beginRiskCaptcha() {
 if (!riskLogin || loading || cooldown > 0) {
 return
 }
 setLoading(true)
 setCookieError("")
 setRiskCaptchaKey("")
 setRiskSmsCode("")
 try {
 const challenge = await getBilibiliRiskGeetest()
 setRiskChallenge(challenge)
 } catch (error) {
 setCookieError(
 error instanceof Error ? error.message : "获取安全验证失败",
 )
 notifyFromError("获取安全验证失败", error)
 } finally {
 setLoading(false)
 }
 }

 const handleRiskGeetestSuccess = useCallback(
 async (result: GeetestResult) => {
 if (
 !riskLogin ||
 !riskChallenge ||
 loading ||
 riskSmsBusyRef.current
 ) {
 return
 }
 riskSmsBusyRef.current = true
 setLoading(true)
 setCookieError("")
 try {
 const key = await sendBilibiliRiskSms({
 risk: riskLogin,
 challenge: riskChallenge,
 validate: result.geetest_validate,
 seccode: result.geetest_seccode,
 challengeResult: result.geetest_challenge,
 })
 setRiskCaptchaKey(key)
 setRiskChallenge(null)
 setCooldown(60)
 notifySuccess("安全验证通过，短信验证码已发送")
 } catch (error) {
 setRiskChallenge(null)
 setCookieError(error instanceof Error ? error.message : "发送验证码失败")
 notifyFromError("发送安全验证短信失败", error)
 } finally {
 riskSmsBusyRef.current = false
 setLoading(false)
 }
 },
 [loading, riskChallenge, riskLogin],
 )

 const handleRiskGeetestCancel = useCallback(() => {
 setRiskChallenge(null)
 }, [])

 const handleRiskGeetestError = useCallback((message: string) => {
 setRiskChallenge(null)
 setCookieError(message)
 }, [])

 async function finishRiskLogin() {
 if (!riskLogin || !riskCaptchaKey || !riskSmsCode.trim() || loading) {
 return
 }
 setLoading(true)
 setCookieError("")
 try {
 const next = await completeBilibiliRiskLogin({
 risk: riskLogin,
 code: riskSmsCode,
 captchaKey: riskCaptchaKey,
 })
 setStatus(next)
 onOpenChange(false)
 notifySuccess("B站登录成功", { description: next.account?.name })
 } catch (error) {
 setCookieError(error instanceof Error ? error.message : "手机号验证失败")
 notifyFromError("手机号验证失败", error)
 } finally {
 setLoading(false)
 }
 }

 async function sendSmsCode() {
 if (loading || cooldown > 0) {
 return
 }
 if (!/^\d{6,15}$/.test(phone.trim())) {
 setCookieError("请输入有效的手机号")
 return
 }
 setLoading(true)
 setCookieError("")
 try {
 const key = await sendBilibiliSmsCode(phone)
 setCaptchaKey(key)
 setCooldown(60)
 notifySuccess("验证码已发送")
 } catch (error) {
 setCookieError(error instanceof Error ? error.message : "验证码发送失败")
 notifyFromError("验证码发送失败", error)
 } finally {
 setLoading(false)
 }
 }

 async function smsLogin() {
 if (loading) {
 return
 }
 if (!captchaKey) {
 setCookieError("请先获取验证码")
 return
 }
 if (!smsCode.trim()) {
 setCookieError("请输入验证码")
 return
 }
 setLoading(true)
 setCookieError("")
 try {
 const next = await loginBilibiliWithSms({
 phone,
 code: smsCode,
 captchaKey,
 })
 setStatus(next)
 onOpenChange(false)
 notifySuccess("B站登录成功", { description: next.account?.name })
 } catch (error) {
 setCookieError(error instanceof Error ? error.message : "登录失败")
 notifyFromError("登录失败", error)
 } finally {
 setLoading(false)
 }
 }

 async function logout() {
 setLoading(true)
 try {
 await logoutBilibili()
 setStatus({ loggedIn: false, account: null })
 notifySuccess("已退出B站账号")
 } finally {
 setLoading(false)
 }
 }

 if (status.loggedIn && status.account) {
 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-sm">
 <DialogHeader>
 <DialogTitle>B站账号</DialogTitle>
 <DialogDescription>
登录后可以在资料库中查看自己的收藏夹
 </DialogDescription>
 </DialogHeader>
 <div className="flex min-w-0 items-center gap-3 py-2">
 {status.account.avatarUrl ? (
 <img
 src={status.account.avatarUrl}
 alt=""
 width={48}
 height={48}
 loading="lazy"
 decoding="async"
 className="size-12 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10"
 />
 ) : (
 <span className="flex size-12 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[14px] font-medium">
 {status.account.name.slice(0,1)}
 </span>
 )}
 <div className="min-w-0">
 <p className="truncate text-[14px] font-medium">
 {status.account.name}
 </p>
 <p className="mt-0.5 text-[12px] text-muted-foreground">
 UID {status.account.mid}
 </p>
 </div>
 </div>
 <DialogFooter>
 <ActionButton
 variant="danger"
 icon={<LogOut className="size-3.5" aria-hidden="true" />}
 disabled={loading}
 onClick={() => void logout()}
 >
退出登录
 </ActionButton>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 )
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>登录B站账号</DialogTitle>
 <DialogDescription>
登录状态只保存在本机
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div
 role="tablist"
 aria-label="B站登录方式"
 className="material-segmented flex gap-1 rounded-full p-1"
 >
 {([
 ["password", "密码"],
 ["sms", "短信"],
 ["qr", "扫码"],
 ["cookie", "Cookie"],
 ] as const).map(([id, label]) => (
 <button
 key={id}
 id={`bilibili-auth-tab-${id}`}
 type="button"
 role="tab"
 aria-selected={tab === id}
 aria-controls={`bilibili-auth-panel-${id}`}
 tabIndex={tab === id ? 0 : -1}
 onClick={() => setTab(id)}
 onKeyDown={(event) => {
 if (
 event.key !== "ArrowLeft" &&
 event.key !== "ArrowRight" &&
 event.key !== "Home" &&
 event.key !== "End"
 ) {
 return
 }
 event.preventDefault()
 const tabs = Array.from(
 event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
 '[role="tab"]',
 ) ?? [],
 )
 const currentIndex = tabs.indexOf(event.currentTarget)
 const nextIndex =
 event.key === "Home"
 ? 0
 : event.key === "End"
 ? tabs.length - 1
 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
 tabs.length
 const nextTab = tabs[nextIndex]
 nextTab?.focus()
 if (nextTab) {
 setTab(
 nextTab.id.endsWith("-password")
 ? "password"
 : nextTab.id.endsWith("-sms")
 ? "sms"
 : nextTab.id.endsWith("-cookie")
 ? "cookie"
 : "qr",
 )
 }
 }}
 className={cn(
 "min-h-9 flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
 tab === id
 ? "bg-background text-foreground shadow-sm"
 : "text-muted-foreground hover:text-foreground",
 )}
 >
 {label}
 </button>
 ))}
 </div>
 {tab === "password" ? (
 <div
 id="bilibili-auth-panel-password"
 role="tabpanel"
 aria-labelledby="bilibili-auth-tab-password"
 className="space-y-3"
 >
 {riskLogin ? (
 <div className="space-y-3">
 <div className="flex items-start gap-2">
 <button
 type="button"
 aria-label="返回密码登录"
 title="返回密码登录"
 onClick={() => {
 setRiskLogin(null)
 setRiskChallenge(null)
 setRiskCaptchaKey("")
 setRiskSmsCode("")
 riskSmsBusyRef.current = false
 }}
 className="mt-0.5 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
 >
 <ArrowLeft aria-hidden="true" className="size-4" />
 </button>
 <div className="min-w-0">
 <p className="text-[13px] font-medium">需要验证绑定手机号</p>
 <p className="mt-1 text-[12px] text-muted-foreground">
 验证码将发送至 {riskLogin.hiddenPhone}
 </p>
 </div>
 </div>
 {riskChallenge ? (
 <GeetestWebView
 challenge={riskChallenge}
 onSuccess={handleRiskGeetestSuccess}
 onCancel={handleRiskGeetestCancel}
 onError={handleRiskGeetestError}
 />
 ) : null}
 <ActionButton
 variant="default"
 className="min-h-11"
 disabled={loading || cooldown > 0}
 onClick={() => void beginRiskCaptcha()}
 >
 {cooldown > 0
 ? `${cooldown}s 后可重新获取`
 : loading
 ? "正在准备验证…"
 : riskCaptchaKey
 ? "重新发送验证码"
 : "获取短信验证码"}
 </ActionButton>
 {riskCaptchaKey ? (
 <>
 <input
 type="text"
 name="bilibili-risk-sms-code"
 value={riskSmsCode}
 onChange={(event) => setRiskSmsCode(event.currentTarget.value)}
 placeholder="短信验证码…"
 aria-label="手机号验证短信验证码"
 inputMode="numeric"
 autoComplete="one-time-code"
 spellCheck={false}
 disabled={loading}
 className="material-field h-11 w-full rounded-xl px-3 text-base outline-none sm:h-10 sm:text-[13px]"
 />
 <ActionButton
 variant="primary"
 className="min-h-11"
 disabled={loading || !riskSmsCode.trim()}
 onClick={() => void finishRiskLogin()}
 >
 {loading ? "验证中…" : "验证并登录"}
 </ActionButton>
 </>
 ) : null}
 </div>
 ) : (
 <>
 <input
 type="text"
 name="bilibili-username"
 value={username}
 onChange={(event) => setUsername(event.currentTarget.value)}
 placeholder="邮箱或手机号…"
 aria-label="B站账号"
 autoComplete="username"
 spellCheck={false}
 disabled={loading}
 className="material-field h-11 w-full rounded-xl px-3 text-base outline-none sm:h-10 sm:text-[13px]"
 />
 <input
 type="password"
 name="bilibili-password"
 value={password}
 onChange={(event) => setPassword(event.currentTarget.value)}
 placeholder="密码…"
 aria-label="B站密码"
 autoComplete="current-password"
 disabled={loading}
 className="material-field h-11 w-full rounded-xl px-3 text-base outline-none sm:h-10 sm:text-[13px]"
 />
 <ActionButton
 variant="primary"
 disabled={loading || !username.trim() || !password}
 onClick={() => void passwordLogin()}
 >
 {loading ? "登录中…" : "登录"}
 </ActionButton>
 </>
 )}
 </div>
 ) : tab === "sms" ? (
 <div
 id="bilibili-auth-panel-sms"
 role="tabpanel"
 aria-labelledby="bilibili-auth-tab-sms"
 className="space-y-3"
 >
 <input
 type="tel"
 name="bilibili-phone"
 value={phone}
 onChange={(event) => setPhone(event.currentTarget.value)}
 placeholder="手机号…"
 aria-label="B站手机号"
 inputMode="tel"
 spellCheck={false}
 autoComplete="tel"
 disabled={loading}
 className="material-field h-11 w-full rounded-xl px-3 text-base outline-none sm:h-10 sm:text-[13px]"
 />
 <div className="flex gap-2">
 <input
 type="text"
 name="bilibili-sms-code"
 value={smsCode}
 onChange={(event) => setSmsCode(event.currentTarget.value)}
 placeholder="验证码…"
 aria-label="短信验证码"
 inputMode="numeric"
 spellCheck={false}
 disabled={loading}
 className="material-field h-11 min-w-0 flex-1 rounded-xl px-3 text-base outline-none sm:h-10 sm:text-[13px]"
 />
 <button
 type="button"
 disabled={loading || cooldown > 0}
 onClick={() => void sendSmsCode()}
 className="h-11 shrink-0 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[12px] font-medium transition-colors hover:bg-[var(--surface-fill-hover)] disabled:opacity-50 sm:h-10"
 >
 {cooldown > 0 ? `${cooldown}s` : "获取验证码"}
 </button>
 </div>
 <ActionButton
 variant="primary"
 disabled={loading || !captchaKey || !smsCode.trim()}
 onClick={() => void smsLogin()}
 >
 {loading ? "登录中…" : "登录"}
 </ActionButton>
 </div>
 ) : tab === "qr" ? (
 <div
 id="bilibili-auth-panel-qr"
 role="tabpanel"
 aria-labelledby="bilibili-auth-tab-qr"
 className="flex flex-col items-center gap-3 py-2"
 >
 {qr ? (
 <div className="flex flex-col items-center gap-3">
 {qrImageUrl ? (
 <img
 src={qrImageUrl}
 alt="B站扫码登录二维码"
 width={240}
 height={240}
 decoding="async"
 className="size-[240px] rounded-xl bg-white p-2"
 />
 ) : (
 <div
 role="status"
 aria-label="正在生成登录二维码"
 className="flex size-[240px] items-center justify-center rounded-xl bg-white text-[12px] text-slate-500"
 >
 {qrState.status === "loading" ? "正在生成二维码…" : "二维码暂不可用"}
 </div>
 )}
 <p className="text-[12px] text-muted-foreground">
 {qrState.status === "waiting"
 ? "请使用B站客户端扫码"
 : qrState.status === "scanned"
 ? "已扫码，请在手机上确认"
 : qrState.status === "expired"
 ? "二维码已过期，请重新生成"
 : "message" in qrState
 ? qrState.message || "等待登录"
 : qrState.status === "loading"
 ? "正在生成二维码…"
 : "等待登录"}
 </p>
 <ActionButton
 icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
 disabled={qrState.status === "loading"}
 onClick={() => {
 setQr(null)
 void startQrLogin()
 }}
 >
刷新二维码
 </ActionButton>
 </div>
 ) : (
 <div className="flex flex-col items-center gap-3">
 <div
 role="status"
 className="flex size-[240px] items-center justify-center rounded-xl bg-[var(--surface-fill)] px-4 text-center text-[12px] text-muted-foreground"
 >
 {qrState.status === "loading"
 ? "正在生成二维码…"
 : "message" in qrState
 ? qrState.message || "二维码暂不可用"
 : "准备二维码…"}
 </div>
 {qrState.status === "failed" ? (
 <ActionButton
 icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
 onClick={() => void startQrLogin()}
 >
重试
 </ActionButton>
 ) : null}
 </div>
 )}
 </div>
 ) : (
 <div
 id="bilibili-auth-panel-cookie"
 role="tabpanel"
 aria-labelledby="bilibili-auth-tab-cookie"
 className="space-y-3"
 >
 <label className="block space-y-1.5">
 <span className="text-[12px] font-medium text-muted-foreground">
 B站 Cookie
 </span>
 <textarea
 value={cookieText}
 name="bilibili-cookie"
 onChange={(event) => {
 setCookieText(event.currentTarget.value)
 setCookieError("")
 }}
 disabled={loading}
 rows={4}
 autoComplete="off"
 spellCheck={false}
 placeholder="粘贴包含 SESSDATA 的 Cookie…"
 className="material-field w-full resize-y rounded-xl px-3 py-2 text-base outline-none focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:text-[12px]"
 />
 </label>
 <p className="text-[12px] leading-relaxed text-muted-foreground">
 从浏览器中复制 B站登录 Cookie。凭据仅保存在本机，请勿分享给他人。
 </p>
 <ActionButton
 variant="primary"
 disabled={!cookieText.trim() || loading}
 onClick={() => void saveCookie()}
 >
 {loading ? "验证中…" : "登录"}
 </ActionButton>
 </div>
 )}
 {cookieError ? (
 <p role="alert" aria-live="polite" className="text-[12px] text-rose-600 dark:text-rose-300">
 {cookieError}
 </p>
 ) : null}
 </div>
 </DialogContent>
 </Dialog>
 )
}

export { AuthDialog }
