import { LogOut, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"

import { cn } from "@/lib/utils"
import {
 AUTH_EVENT,
 completeBilibiliLogin,
 createBilibiliQrLogin,
 fetchBilibiliAuthStatus,
 logoutBilibili,
 pollBilibiliQrLogin,
 saveBilibiliCookie,
 type BilibiliAuthStatus,
} from "@/lib/bilibili/auth"
import { notifyFromError, notifySuccess } from "@/lib/notify"
import { isWebMode } from "@/lib/web-mode"
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

type AuthTab = "qr" | "cookie"

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

 useEffect(() => {
 if (!open) {
 return
 }
 setTab("qr")
 setCookieText("")
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
 if (!open || isWebMode() || tab !== "qr" || qr || qrState.status !== "idle") {
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
                if (result.status === "confirmed" && result.url) {
                    completed = true
                    window.clearInterval(timer)
                    const next = await completeBilibiliLogin(result.url)
                    setStatus(next)
                    setQrState({ status: "idle" })
                    onOpenChange(false)
                    notifySuccess("B站登录成功", {
                        description: next.account?.name,
                    })
                    return
                }
                if (result.status === "confirmed") {
                    completed = true
                    window.clearInterval(timer)
                    setQrState({
                        status: "failed",
                        message: "B站没有返回登录跳转地址，请重新扫码",
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
 {isWebMode() ? (
 <p className="rounded-xl bg-[var(--surface-fill)] px-3 py-2 text-[13px] text-muted-foreground">
 B站登录暂时只支持客户端
 </p>
 ) : (
 <div className="space-y-3">
 <div
 role="tablist"
 aria-label="B站登录方式"
 className="material-segmented flex gap-1 rounded-full p-1"
 >
 {([
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
 setTab(nextTab.id.endsWith("-cookie") ? "cookie" : "qr")
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
 {tab === "qr" ? (
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
 className="material-field w-full resize-y rounded-xl px-3 py-2 text-[12px] outline-none focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
 />
 </label>
 {cookieError ? (
 <p role="alert" className="text-[12px] text-rose-600 dark:text-rose-300">
 {cookieError}
 </p>
 ) : null}
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
 </div>
 )}
 </DialogContent>
 </Dialog>
 )
}

export { AuthDialog }
