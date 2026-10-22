import { invoke } from "@tauri-apps/api/core"
import CryptoJS from "crypto-js"
import forge from "node-forge"

import { bilibiliProxyRequest } from "@/lib/bilibili/proxy"
import { isTauriRuntime } from "@/lib/platform"
import {
    getApiSettings,
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
 auth_code?: string
 token_info?: Record<string, unknown>
 cookie_info?: { cookies?: Array<{ name?: string; value?: string }> }
}

type BilibiliLoginData = BilibiliQrData & {
    status?: number
    message?: string
}

export type BilibiliRiskLogin = {
    tmpCode: string
    requestId: string
    source: string
    refererUrl: string
    hiddenPhone: string
}

export type BilibiliGeetestChallenge = {
    gt: string
    challenge: string
    recaptchaToken: string
}

type BilibiliWebKey = {
    hash?: string
    key?: string
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
const TOKEN_STORAGE_KEY = "musicstorm-bilibili-tv-token"
const AUTH_EVENT = "musicstorm:bilibili-auth"
const TV_APP_KEY = "dfca71928277209b"
const TV_APP_SECRET = "b5475a8825547a4fc26c7d518eaaa02e"
const QR_AUTH_CODE_PATH = "/x/passport-tv-login/qrcode/auth_code"
const QR_POLL_PATH = "/x/passport-tv-login/qrcode/poll"
const LOGIN_KEY_PATH = "/x/passport-login/web/key"
const PASSWORD_LOGIN_PATH = "/x/passport-login/oauth2/login"
const SMS_SEND_PATH = "/x/passport-login/sms/send"
const SMS_LOGIN_PATH = "/x/passport-login/login/sms"
const RISK_INFO_PATH = "/x/safecenter/user/info"
const RISK_CAPTCHA_PATH = "/x/safecenter/captcha/pre"
const RISK_SMS_SEND_PATH = "/x/safecenter/common/sms/send"
const RISK_SMS_VERIFY_PATH = "/x/safecenter/login/tel/verify"
const OAUTH_TOKEN_PATH = "/x/passport-login/oauth2/access_token"
const QR_EXPIRED_CODE = 86038
const QR_SCANNED_CODES = new Set([86090, 86102])
const QR_WAITING_CODES = new Set([86039, 86101])

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

function writeTvTokenInfo(tokenInfo: Record<string, unknown>): void {
 try {
 window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenInfo))
 } catch {
 // Keep the current session usable when storage is unavailable
 }
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
 const body = (await bilibiliProxyRequest({ url:
 "https://api.bilibili.com/x/web-interface/nav",
 })) as BilibiliNavEnvelope
 return authStatusFromNav(body.data ?? {})
}

function signedTvLoginParams(
 params: Record<string, string>,
): Record<string, string> {
 const signed: Record<string, string> = {
 ...params,
 appkey: TV_APP_KEY,
 ts: String(Math.floor(Date.now() / 1000)),
 }
 const query = Object.keys(signed)
 .sort()
 .map(
 (key) =>
 `${encodeURIComponent(key)}=${encodeURIComponent(signed[key] ?? "")}`,
 )
 .join("&")
 return {
 ...signed,
 sign: CryptoJS.MD5(query + TV_APP_SECRET).toString(),
 }
}

function randomDeviceId(): string {
    try {
        const stored = window.localStorage.getItem("musicstorm-bilibili-device-id")
        if (stored) {
            return stored
        }
        const value = crypto.randomUUID().replace(/-/g, "").toUpperCase()
        window.localStorage.setItem("musicstorm-bilibili-device-id", value)
        return value
    } catch {
        return "MUSICSTORM_BILIBILI"
    }
}

function signedAppParams(
    params: Record<string, string>,
): Record<string, string> {
    return signedTvLoginParams(params)
}

function encryptWithPublicKey(value: string, publicKeyPem: string): string {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem)
    return forge.util.encode64(
        publicKey.encrypt(value, "RSAES-PKCS1-V1_5"),
    )
}

function loginCookie(data: BilibiliLoginData | undefined): string {
    return (data?.cookie_info?.cookies ?? [])
        .filter(
            (item): item is { name: string; value: string } =>
                typeof item.name === "string" &&
                item.name !== "" &&
                typeof item.value === "string" &&
                item.value !== "",
        )
        .map((item) => `${item.name}=${item.value}`)
        .join("; ")
}

async function applyLoginData(data: BilibiliLoginData): Promise<void> {
    const cookie = loginCookie(data)
    if (!cookie || !data.token_info) {
        throw new Error("B站登录成功响应缺少账号凭据")
    }
    await setBilibiliCookie(cookie)
    writeTvTokenInfo(data.token_info)
}

async function passportRequest<T>(
    path: string,
    method: "GET" | "POST",
    params?: Record<string, string>,
): Promise<T> {
    const integrated = getApiSettings().mode === "integrated"
    const signed = params
        ? integrated
            ? signedAppParams(params)
            : params
        : undefined
    const body = (method === "POST" && signed ? signed : undefined) as
        | Record<string, string>
        | undefined
    const query =
        method === "GET" && signed
            ? `?${new URLSearchParams(signed).toString()}`
            : ""
    const response = (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${path}${query}`,
        method,
        body,
    })) as { code?: number; message?: string; data?: T }
    if (response.code !== 0 || response.data === undefined) {
        throw new Error(response.message?.trim() || "B站登录请求失败")
    }
    return response.data
}

function riskLoginFromData(data: BilibiliLoginData): BilibiliRiskLogin {
    const rawUrl = data.url?.trim()
    if (!rawUrl) {
        throw new Error(data.message || "登录环境需要手机号验证，但缺少验证信息")
    }
    const url = new URL(rawUrl)
    if (
        url.protocol !== "https:" ||
        url.hostname !== "passport.bilibili.com" ||
        url.pathname !== "/h5-app/passport/risk/verify"
    ) {
        throw new Error("B站返回了不受信任的手机号验证地址")
    }
    const tmpCode = url.searchParams.get("tmp_token") ?? ""
    const requestId = url.searchParams.get("request_id") ?? ""
    const source = url.searchParams.get("source") ?? ""
    if (!tmpCode || !requestId || !source) {
        throw new Error("B站手机号验证参数不完整")
    }
    return {
        tmpCode,
        requestId,
        source,
        refererUrl: url.toString(),
        hiddenPhone: "",
    }
}

async function getBilibiliRiskLoginInfo(
    risk: BilibiliRiskLogin,
): Promise<BilibiliRiskLogin> {
    const query = new URLSearchParams({ tmp_code: risk.tmpCode })
    const response = (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${RISK_INFO_PATH}?${query}`,
    })) as {
        code?: number
        message?: string
        data?: {
            account_info?: {
                hide_tel?: string
                tel_verify?: boolean | number
            }
        }
    }
    const accountInfo = response.data?.account_info
    if (response.code !== 0 || !accountInfo) {
        throw new Error(response.message?.trim() || "无法读取手机号验证信息")
    }
    if (!accountInfo.tel_verify) {
        throw new Error("此账号未绑定可用于验证的手机号")
    }
    return {
        ...risk,
        hiddenPhone: accountInfo.hide_tel?.trim() || "已绑定手机号",
    }
}

async function getBilibiliRiskGeetest(): Promise<BilibiliGeetestChallenge> {
    const response = (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${RISK_CAPTCHA_PATH}`,
        method: "POST",
    })) as {
        code?: number
        message?: string
        data?: {
            gee_gt?: string
            gee_challenge?: string
            recaptcha_token?: string
        }
    }
    const challenge = response.data
    if (
        response.code !== 0 ||
        !challenge?.gee_gt ||
        !challenge.gee_challenge ||
        !challenge.recaptcha_token
    ) {
        throw new Error(response.message?.trim() || "获取极验参数失败")
    }
    return {
        gt: challenge.gee_gt,
        challenge: challenge.gee_challenge,
        recaptchaToken: challenge.recaptcha_token,
    }
}

async function sendBilibiliRiskSms(input: {
    risk: BilibiliRiskLogin
    challenge: BilibiliGeetestChallenge
    validate: string
    seccode: string
    challengeResult: string
}): Promise<string> {
    const params = {
        disable_rcmd: "0",
        sms_type: "loginTelCheck",
        tmp_code: input.risk.tmpCode,
        gee_challenge: input.challengeResult,
        gee_seccode: input.seccode,
        gee_validate: input.validate,
        recaptcha_token: input.challenge.recaptchaToken,
    }
    const response = (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${RISK_SMS_SEND_PATH}`,
        method: "POST",
        body:
            getApiSettings().mode === "integrated"
                ? signedAppParams(params)
                : params,
        referer: input.risk.refererUrl,
    })) as {
        code?: number
        message?: string
        data?: { captcha_key?: string }
    }
    const captchaKey = response.data?.captcha_key
    if (response.code !== 0 || !captchaKey) {
        throw new Error(response.message?.trim() || "安全验证短信发送失败")
    }
    return captchaKey
}

async function completeBilibiliRiskLogin(input: {
    risk: BilibiliRiskLogin
    code: string
    captchaKey: string
}): Promise<BilibiliAuthStatus> {
    const verifyParams = {
        type: "loginTelCheck",
        code: input.code.trim(),
        tmp_code: input.risk.tmpCode,
        request_id: input.risk.requestId,
        source: input.risk.source,
        captcha_key: input.captchaKey,
    }
    const verification = (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${RISK_SMS_VERIFY_PATH}`,
        method: "POST",
        body:
            getApiSettings().mode === "integrated"
                ? signedAppParams(verifyParams)
                : verifyParams,
        referer: input.risk.refererUrl,
    })) as {
        code?: number
        message?: string
        data?: { code?: string }
    }
    const oauthCode = verification.data?.code
    if (verification.code !== 0 || !oauthCode) {
        throw new Error(verification.message?.trim() || "手机号验证失败")
    }

    const deviceId = randomDeviceId()
    const tokenParams = {
        build: "2001100",
        buvid: deviceId,
        code: oauthCode,
        disable_rcmd: "0",
        grant_type: "authorization_code",
        local_id: deviceId,
        mobi_app: "android_hd",
        platform: "android",
    }
    const loginData = await passportRequest<BilibiliLoginData>(
        OAUTH_TOKEN_PATH,
        "POST",
        tokenParams,
    )
    await applyLoginData(loginData)
    return completeBilibiliLogin()
}

async function tvLoginPost<T>(
 path: string,
 params: Record<string, string>,
): Promise<T> {
 const signed =
 getApiSettings().mode === "integrated"
 ? signedTvLoginParams(params)
 : params
 const query = new URLSearchParams(signed).toString()
 const body = (await bilibiliProxyRequest({
 url: `https://passport.bilibili.com${path}?${query}`,
 method: "POST",
 })) as { code?: number; message?: string; data?: T }
 if (body.code !== 0 || body.data === undefined) {
 throw new Error(body.message?.trim() || "B站登录请求失败")
 }
 return body.data
}

async function createBilibiliQrLogin(): Promise<{
 url: string
 key: string
}> {
 const body = await tvLoginPost<BilibiliQrData>(QR_AUTH_CODE_PATH, {
 local_id: "0",
 platform: "android",
 mobi_app: "android_hd",
 })
 const url = body.url ?? ""
 const key = body.auth_code ?? ""
 if (!url || !key) {
 throw new Error("无法生成登录二维码")
 }
 return { url, key }
}

async function pollBilibiliQrLogin(key: string): Promise<{
 status: "waiting" | "scanned" | "confirmed" | "expired" | "failed"
 message?: string
}> {
 const response = (await bilibiliProxyRequest({
 url: `https://passport.bilibili.com${QR_POLL_PATH}?${new URLSearchParams(
 getApiSettings().mode === "integrated"
 ? signedTvLoginParams({ auth_code: key, local_id: "0" })
 : { auth_code: key, local_id: "0" },
 ).toString()}`,
 method: "POST",
 })) as {
 code?: number
 message?: string
 data?: BilibiliQrData
 }
 const code = response.code
 if (code ===0) {
 await applyLoginData(response.data ?? {})
 return {
 status: "confirmed",
 message: response.message,
 }
 }
 if (code === QR_EXPIRED_CODE) {
 return { status: "expired", message: response.message }
 }
 if (QR_SCANNED_CODES.has(code ?? Number.NaN)) {
 return { status: "scanned", message: response.message }
 }
 if (QR_WAITING_CODES.has(code ?? Number.NaN) || code == null) {
 return { status: "waiting", message: response.message }
 }
 return { status: "failed", message: response.message }
}

async function getBilibiliLoginKey(): Promise<{
    hash: string
    key: string
}> {
    const data = await passportRequest<BilibiliWebKey>(
        LOGIN_KEY_PATH,
        "GET",
    )
    if (!data.hash || !data.key) {
        throw new Error("B站登录密钥响应无效")
    }
    return { hash: data.hash, key: data.key }
}

function commonLoginParams(): Record<string, string> {
    const deviceId = randomDeviceId()
    return {
        bili_local_id: deviceId,
        build: "2001100",
        buvid: deviceId,
        c_locale: "zh_CN",
        channel: "master",
        device: "phone",
        device_id: deviceId,
        device_name: "vivo",
        device_platform: "Android14vivo",
        disable_rcmd: "0",
        from_pv: "main.homepage.avatar-nologin.all.click",
        from_url: "bilibili://pegasus/promo",
        local_id: deviceId,
        mobi_app: "android_hd",
        platform: "android",
        s_locale: "zh_CN",
        statistics: '{"appId":5,"platform":3,"version":"2.0.1","abtest":""}',
    }
}

async function loginBilibiliWithPassword(
    username: string,
    password: string,
): Promise<
    | { type: "complete"; status: BilibiliAuthStatus }
    | { type: "risk"; risk: BilibiliRiskLogin }
> {
    const loginKey = await getBilibiliLoginKey()
    const params = {
        ...commonLoginParams(),
        permission: "ALL",
        username: username.trim(),
        password: encryptWithPublicKey(
            `${loginKey.hash}${password}`,
            loginKey.key,
        ),
        dt: encryptWithPublicKey(
            Math.random().toString(36).slice(2, 18),
            loginKey.key,
        ),
    }
    const data = await passportRequest<BilibiliLoginData>(
        PASSWORD_LOGIN_PATH,
        "POST",
        params,
    )
    if (data.status === 2) {
        const risk = await getBilibiliRiskLoginInfo(riskLoginFromData(data))
        return { type: "risk", risk }
    }
    await applyLoginData(data)
    return { type: "complete", status: await completeBilibiliLogin() }
}

async function sendBilibiliSmsCode(phone: string): Promise<string> {
    const data = await passportRequest<{
        captcha_key?: string
        recaptcha_url?: string
    }>(SMS_SEND_PATH, "POST", {
        ...commonLoginParams(),
        cid: "86",
        tel: phone.trim(),
    })
    if (!data.captcha_key) {
        throw new Error("B站没有返回验证码凭据")
    }
    return data.captcha_key
}

async function loginBilibiliWithSms(input: {
    phone: string
    code: string
    captchaKey: string
}): Promise<BilibiliAuthStatus> {
    const loginKey = await getBilibiliLoginKey()
    const data = await passportRequest<BilibiliLoginData>(
        SMS_LOGIN_PATH,
        "POST",
        {
            ...commonLoginParams(),
            captcha_key: input.captchaKey,
            cid: "86",
            code: input.code.trim(),
            tel: input.phone.trim(),
            dt: encryptWithPublicKey(
                Math.random().toString(36).slice(2, 18),
                loginKey.key,
            ),
        },
    )
    await applyLoginData(data)
    return completeBilibiliLogin()
}

async function completeBilibiliLogin(): Promise<BilibiliAuthStatus> {
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
 try {
 window.localStorage.removeItem(TOKEN_STORAGE_KEY)
 } catch {
 // The cookie is already cleared from the active session
 }
}

export {
 AUTH_EVENT,
    completeBilibiliRiskLogin,
 completeBilibiliLogin,
 createBilibiliQrLogin,
 fetchBilibiliAuthStatus,
    getBilibiliRiskGeetest,
    getBilibiliLoginKey,
    loginBilibiliWithPassword,
    loginBilibiliWithSms,
 logoutBilibili,
 pollBilibiliQrLogin,
 readCookieHeader,
 saveBilibiliCookie,
    sendBilibiliRiskSms,
    sendBilibiliSmsCode,
}
