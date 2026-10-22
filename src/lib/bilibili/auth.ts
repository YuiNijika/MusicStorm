import { invoke } from "@tauri-apps/api/core"

import { bilibiliPassportRequest } from "@/lib/bilibili/client"
import { bilibiliProxyGet } from "@/lib/bilibili/proxy"
import { isTauriRuntime } from "@/lib/platform"
import {
    getApiSettings,
    getBilibiliBaseUrl,
} from "@/lib/netease/api-settings"

type BilibiliNavData = {
 isLogin?: boolean
 mid?: number
 uname?: string
 face?: string
 vipStatus?: number
 vipstatus?: number
}

type BilibiliNavEnvelope = {
 data?: BilibiliNavData
}

type BilibiliQrData = {
 url?: string
 qrcode_key?: string
}

export type BilibiliAccount = {
 mid: number
 name: string
 avatarUrl: string
 isVip: boolean
}

export type BilibiliAuthStatus = {
 loggedIn: boolean
 account: BilibiliAccount | null
}

const STORAGE_KEY = "musicstorm-bilibili-cookie"
const AUTH_EVENT = "musicstorm:bilibili-auth"

function readCookieHeader(): string {
 if (typeof window === "undefined") {
 return ""
 }
 try {
 return window.localStorage.getItem(STORAGE_KEY) ?? ""
 } catch {
 return ""
 }
}

function writeCookieHeader(cookieHeader: string): void {
 try {
 if (cookieHeader.trim()) {
 window.localStorage.setItem(STORAGE_KEY, cookieHeader)
 } else {
 window.localStorage.removeItem(STORAGE_KEY)
 }
 } catch {
 // Keep the current session usable when storage is unavailable
 }
 window.dispatchEvent(new CustomEvent(AUTH_EVENT))
}

async function setBilibiliCookie(cookieHeader: string): Promise<void> {
 if (isTauriRuntime() && getApiSettings().mode === "integrated") {
 await invoke("bilibili_set_cookie", { cookie: cookieHeader })
 }
 writeCookieHeader(cookieHeader)
}

function parseCookiePairs(input: string): Map<string, string> {
 const map = new Map<string, string>()
 for (const part of input.split(";")) {
 const index = part.indexOf("=")
 if (index <=0) {
 continue
 }
 const name = part.slice(0, index).trim()
 const value = part.slice(index +1).trim()
 if (name) {
 map.set(name, value)
 }
 }
 return map
}

function normalizeCookieInput(input: string): string {
 const trimmed = input.trim()
 if (!trimmed) {
 return ""
 }
 if (trimmed.includes(";") || trimmed.includes("=")) {
 const pairs = parseCookiePairs(trimmed)
 return [...pairs.entries()]
 .map(([name, value]) => `${name}=${value}`)
 .join("; ")
 }
 try {
 return cookiesFromLoginUrl(trimmed)
 } catch {
 return trimmed
 }
}

function cookiesFromLoginUrl(rawUrl: string): string {
 try {
 const url = new URL(rawUrl)
 const names = ["SESSDATA", "bili_jct", "DedeUserID", "ac_time_value"]
 return names
 .map((name) => {
 const value = url.searchParams.get(name)
 return value ? `${name}=${value}` : ""
 })
 .filter(Boolean)
 .join("; ")
 } catch {
 return ""
 }
}

function authStatusFromNav(data: BilibiliNavData): BilibiliAuthStatus {
 if (!data.isLogin) {
 return { loggedIn: false, account: null }
 }
 return {
 loggedIn: true,
 account: {
 mid: data.mid ??0,
 name: data.uname?.trim() || "已登录",
 avatarUrl: normalizeUrl(data.face),
 isVip: (data.vipStatus ?? data.vipstatus ??0) >0,
 },
 }
}

function normalizeUrl(value: string | undefined): string {
 if (!value) {
 return ""
 }
 if (value.startsWith("//")) {
 return `https:${value}`
 }
 if (value.startsWith("http://")) {
 return value.replace(/^http:\/\//, "https://")
 }
 return value
}

async function fetchBilibiliAuthStatus(): Promise<BilibiliAuthStatus> {
 const body = (await bilibiliProxyGet(
 "https://api.bilibili.com/x/web-interface/nav",
 )) as BilibiliNavEnvelope
 return authStatusFromNav(body.data ?? {})
}

async function createBilibiliQrLogin(): Promise<{
 url: string
 key: string
}> {
 const body = await bilibiliPassportRequest<BilibiliQrData>(
 "/x/passport-login/web/qrcode/generate",
 { source: "main-fe-header" },
 )
 const url = body.url ?? ""
 const key = body.qrcode_key ?? ""
 if (!url || !key) {
 throw new Error("无法生成登录二维码")
 }
 return { url, key }
}

async function pollBilibiliQrLogin(key: string): Promise<{
 status: "waiting" | "scanned" | "confirmed" | "expired" | "failed"
 url?: string
 message?: string
}> {
 const body = await bilibiliPassportRequest<
 BilibiliQrData & { code?: number; message?: string }
 >("/x/passport-login/web/qrcode/poll", {
 qrcode_key: key,
 source: "main-fe-header",
 })
 if (body.cookie) {
 await setBilibiliCookie(body.cookie)
 }
 const code = body.code
 if (code ===0) {
 return {
 status: "confirmed",
 url: body.url,
 message: body.message,
 }
 }
 if (code ===86038) {
 return { status: "expired", message: body.message }
 }
 if (code ===86090 || code ===86102) {
 return { status: "scanned", message: body.message }
 }
 if (code ===86101 || code == null) {
 return { status: "waiting", message: body.message }
 }
 return { status: "failed", message: body.message }
}

async function completeBilibiliLogin(loginUrl: string): Promise<BilibiliAuthStatus> {
 const existingStatus = await fetchBilibiliAuthStatus().catch(() => null)
 if (existingStatus?.loggedIn) {
 window.dispatchEvent(new CustomEvent(AUTH_EVENT))
 return existingStatus
 }
 if (isTauriRuntime() && getApiSettings().mode === "integrated") {
 const completion = await invoke<{ loggedIn?: boolean }>(
 "bilibili_complete_qr_login",
 {
 callbackUrl: loginUrl,
 },
 )
 if (!completion?.loggedIn) {
 throw new Error("B站未确认登录状态，请重新扫码")
 }
 } else {
 const response = await fetch(
 `${getBilibiliBaseUrl()}/auth/qrcode/complete`,
 {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ callback_url: loginUrl }),
 credentials: "omit",
 },
 )
 const payload = (await response.json()) as {
 success?: boolean
 message?: string
 data?: { data?: { cookie?: string } }
 }
 if (!response.ok || !payload.success) {
 throw new Error(payload.message ?? "B站登录回调失败")
 }
 const cookie = payload.data?.data?.cookie ?? ""
 if (!cookie) {
 throw new Error("B站登录未返回有效登录状态")
 }
 writeCookieHeader(cookie)
 }
 const status = await fetchBilibiliAuthStatus()
 if (!status.loggedIn) {
 throw new Error("登录状态检查失败，请重试")
 }
 window.dispatchEvent(new CustomEvent(AUTH_EVENT))
 return status
}

async function saveBilibiliCookie(cookieHeader: string): Promise<BilibiliAuthStatus> {
 const pairs = parseCookiePairs(normalizeCookieInput(cookieHeader))
 if (!pairs.has("SESSDATA")) {
 throw new Error("登录信息不完整，请重试")
 }
 await setBilibiliCookie(normalizeCookieInput(cookieHeader))
 const status = await fetchBilibiliAuthStatus()
 if (!status.loggedIn) {
 await logoutBilibili()
 throw new Error("登录已失效，请重新登录")
 }
 return status
}

async function logoutBilibili(): Promise<void> {
 if (isTauriRuntime() && getApiSettings().mode === "integrated") {
 await invoke("bilibili_clear_cookie").catch(() => undefined)
 }
 writeCookieHeader("")
}

export {
 AUTH_EVENT,
 completeBilibiliLogin,
 createBilibiliQrLogin,
 fetchBilibiliAuthStatus,
 logoutBilibili,
 pollBilibiliQrLogin,
 readCookieHeader,
 saveBilibiliCookie,
}
