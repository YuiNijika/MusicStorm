import { invoke } from "@tauri-apps/api/core"
import CryptoJS from "crypto-js"
import forge from "node-forge"

import { bilibiliProxyRequest } from "@/lib/bilibili/proxy"
import { getApiSettings } from "@/lib/netease/api-settings"
import { isTauriRuntime } from "@/lib/platform"

type BilibiliNavData = {
    isLogin?: boolean
    mid?: number
    uname?: string
    face?: string
    vipStatus?: number
    vipstatus?: number
}

type BilibiliNavEnvelope = {
    code?: number
    message?: string
    data?: BilibiliNavData
}

type BilibiliMemberData = {
    mid?: number
    uname?: string
    face?: string
    vip?: {
        status?: number
    }
}

type BilibiliQrData = {
    url?: string
    auth_code?: string
    token_info?: Record<string, unknown>
    cookie_info?: {
        cookies?: Array<{ name?: string; value?: string }>
    }
}

type BilibiliLoginData = BilibiliQrData & {
    status?: number
    message?: string
}

type BilibiliPassportResponse<T> = {
    code?: number
    message?: string
    data?: T
}

type BilibiliCaptchaData = {
    url?: string
    recaptcha_url?: string
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

export type BilibiliGeetestVerification = {
    challenge: BilibiliGeetestChallenge
    validate: string
    seccode: string
    challengeResult: string
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

export type BilibiliPasswordLoginResult =
    | { type: "complete"; status: BilibiliAuthStatus }
    | { type: "risk"; risk: BilibiliRiskLogin }
    | { type: "captcha"; challenge: BilibiliGeetestChallenge }

export type BilibiliSmsSendResult =
    | { type: "sent"; captchaKey: string }
    | { type: "captcha"; challenge: BilibiliGeetestChallenge }

const STORAGE_KEY = "musicstorm-bilibili-cookie"
const TOKEN_STORAGE_KEY = "musicstorm-bilibili-tv-token"
const ANONYMOUS_BUVID_KEY = "musicstorm-bilibili-anonymous-buvid-v2"
const ANONYMOUS_BUVID3_KEY = "musicstorm-bilibili-buvid3-v2"
const DEVICE_ID_KEY = "musicstorm-bilibili-device-id-v2"
const AUTH_EVENT = "musicstorm:bilibili-auth"
const TV_APP_KEY = "dfca71928277209b"
const TV_APP_SECRET = "b5475a8825547a4fc26c7d518eaaa02e"
const LOGIN_APP_KEY = "dfca71928277209b"
const LOGIN_APP_SECRET = "b5475a8825547a4fc26c7d518eaaa02e"
const QR_AUTH_CODE_PATH = "/x/passport-tv-login/qrcode/auth_code"
const QR_POLL_PATH = "/x/passport-tv-login/qrcode/poll"
const MEMBER_ACCOUNT_PATH = "/x/member/web/account"
const LOGIN_KEY_PATH = "/x/passport-login/web/key"
const PASSWORD_LOGIN_PATH = "/x/passport-login/oauth2/login"
const SMS_SEND_PATH = "/x/passport-login/sms/send"
const SMS_LOGIN_PATH = "/x/passport-login/login/sms"
const RISK_INFO_PATH = "/x/safecenter/user/info"
const RISK_CAPTCHA_PATH = "/x/safecenter/captcha/pre"
const RISK_SMS_SEND_PATH = "/x/safecenter/common/sms/send"
const RISK_SMS_VERIFY_PATH = "/x/safecenter/login/tel/verify"
const OAUTH_TOKEN_PATH = "/x/passport-login/oauth2/access_token"
const PASSWORD_CAPTCHA_CODE = -105
const QR_EXPIRED_CODE = 86038
const QR_SCANNED_CODES = new Set([86090, 86102])
const QR_WAITING_CODES = new Set([86039, 86101])
const QR_LOGIN_LIFETIME_MS = 180_000
const QR_POLL_INTERVAL_MS = 1_000
const TRUSTED_LOGIN_HOSTS = new Set([
    "passport.bilibili.com",
    "passport.biligame.com",
    "passport.huasheng.cn",
    "passport.bilibili.cn",
])
const TRUSTED_VERIFICATION_HOSTS = new Set([
    "passport.bilibili.com",
])
const LOGIN_STATISTICS =
    '{"appId":5,"platform":3,"version":"2.0.1","abtest":""}'

class BilibiliPassportError extends Error {
    code: number
    data: unknown

    constructor(message: string, code: number, data: unknown) {
        super(message)
        this.name = "BilibiliPassportError"
        this.code = code
        this.data = data
    }
}

function readStorage(key: string): string {
    if (typeof window === "undefined") {
        return ""
    }
    try {
        return window.localStorage.getItem(key) ?? ""
    } catch {
        return ""
    }
}

function writeStorage(key: string, value: string): void {
    try {
        if (value) {
            window.localStorage.setItem(key, value)
        } else {
            window.localStorage.removeItem(key)
        }
    } catch {
        // The current session can continue without persistent storage
    }
}

function readCookieHeader(): string {
    return readStorage(STORAGE_KEY)
}

function writeCookieHeader(cookieHeader: string): void {
    writeStorage(STORAGE_KEY, cookieHeader)
    window.dispatchEvent(new CustomEvent(AUTH_EVENT))
}

function writeTvTokenInfo(tokenInfo: Record<string, unknown>): void {
    writeStorage(TOKEN_STORAGE_KEY, JSON.stringify(tokenInfo))
}

async function setBilibiliCookie(cookieHeader: string): Promise<void> {
    if (isTauriRuntime() && getApiSettings().mode === "integrated") {
        await invoke("bilibili_set_cookie", { cookie: cookieHeader })
    }
    writeCookieHeader(cookieHeader)
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(bytes)
        return bytes
    }
    const fallback = CryptoJS.lib.WordArray.random(length)
    for (let index = 0; index < length; index += 1) {
        bytes[index] =
            (fallback.words[index >>> 2] ?? 0) >>>
            (24 - (index % 4) * 8) &
            0xff
    }
    return bytes
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (value) =>
        value.toString(16).padStart(2, "0"),
    ).join("")
}

function randomLoginString(length: number): string {
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return Array.from(randomBytes(length), (value) =>
        alphabet.charAt(value % alphabet.length),
    ).join("")
}

function generateBuvid(): string {
 const digest = bytesToHex(randomBytes(16)).toUpperCase()
    return `XY${digest[2]}${digest[12]}${digest[22]}${digest}`
}

function generateBuvid3(): string {
    const uuid =
        typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID().toUpperCase()
            : [
                  bytesToHex(randomBytes(4)),
                  bytesToHex(randomBytes(2)),
                  bytesToHex(randomBytes(2)),
                  bytesToHex(randomBytes(2)),
                  bytesToHex(randomBytes(6)),
              ].join("-")
    const suffix = Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")
    return `${uuid}${suffix}infoc`
}

function anonymousBuvid(): string {
    const stored = readStorage(ANONYMOUS_BUVID_KEY)
    if (stored) {
        return stored
    }
    const value = generateBuvid()
    writeStorage(ANONYMOUS_BUVID_KEY, value)
    return value
}

function anonymousBuvid3(): string {
    const stored = readStorage(ANONYMOUS_BUVID3_KEY)
    if (stored) {
        return stored
    }
    const value = generateBuvid3()
    writeStorage(ANONYMOUS_BUVID3_KEY, value)
    return value
}

function decToBcd(value: number): number {
    return ((Math.floor(value / 10) << 4) | (value % 10)) & 0xff
}

function generateDeviceId(): string {
    const now = new Date()
    const bytes = randomBytes(31)
    bytes.set(
        [
            decToBcd(now.getFullYear() / 100),
            decToBcd(now.getFullYear() % 100),
            decToBcd(now.getMonth() + 1),
            decToBcd(now.getDate()),
            decToBcd(now.getHours()),
            decToBcd(now.getMinutes()),
            decToBcd(now.getSeconds()),
        ],
        16,
    )
    const checksum = bytes.reduce((sum, value) => sum + value, 0) & 0xff
 return `${CryptoJS.MD5(CryptoJS.enc.Hex.parse(bytesToHex(bytes))).toString(CryptoJS.enc.Hex)}${checksum.toString(16).padStart(2, "0")}`
}

function deviceId(): string {
    const stored = readStorage(DEVICE_ID_KEY)
    if (stored) {
        return stored
    }
    const value = generateDeviceId()
    writeStorage(DEVICE_ID_KEY, value)
    return value
}

function anonymousCookie(): string {
    return `buvid3=${anonymousBuvid3()}`
}

function parseCookiePairs(input: string): Map<string, string> {
    const map = new Map<string, string>()
    for (const part of input.split(";")) {
        const index = part.indexOf("=")
        if (index <= 0) {
            continue
        }
        const name = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
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
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            return cookiesFromLoginUrl(trimmed)
        } catch {
            return trimmed
        }
    }
    if (trimmed.includes(";") || trimmed.includes("=")) {
        const pairs = parseCookiePairs(trimmed)
        return [...pairs.entries()]
            .map(([name, value]) => `${name}=${value}`)
            .join("; ")
    }
    return trimmed
}

function cookiesFromLoginUrl(rawUrl: string): string {
    const url = new URL(rawUrl)
    const names = ["SESSDATA", "bili_jct", "DedeUserID", "ac_time_value"]
    return names
        .map((name) => {
            const value = url.searchParams.get(name)
            return value ? `${name}=${value}` : ""
        })
        .filter(Boolean)
        .join("; ")
}

function mergeAnonymousCookie(cookie: string): string {
    const pairs = parseCookiePairs(cookie)
    if (!pairs.has("buvid3")) {
        pairs.set("buvid3", anonymousBuvid3())
    }
    return [...pairs.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
}

function accountFromCookie(cookie: string): BilibiliAccount | null {
    const mid = Number(parseCookiePairs(cookie).get("DedeUserID") ?? 0)
    if (!Number.isFinite(mid) || mid <= 0) {
        return null
    }
    return {
        mid,
        name: "已登录",
        avatarUrl: "",
        isVip: false,
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

function authStatusFromNav(data: BilibiliNavData): BilibiliAuthStatus {
    if (!data.isLogin) {
        return { loggedIn: false, account: null }
    }
    return {
        loggedIn: true,
        account: {
            mid: data.mid ?? 0,
            name: data.uname?.trim() || "已登录",
            avatarUrl: normalizeUrl(data.face),
            isVip: (data.vipStatus ?? data.vipstatus ?? 0) > 0,
        },
    }
}

function authStatusFromMember(data: BilibiliMemberData): BilibiliAuthStatus {
    return {
        loggedIn: true,
        account: {
            mid: data.mid ?? 0,
            name: data.uname?.trim() || "已登录",
            avatarUrl: normalizeUrl(data.face),
            isVip: (data.vip?.status ?? 0) > 0,
        },
    }
}

async function fetchBilibiliAuthStatus(): Promise<BilibiliAuthStatus> {
    const cookie = readCookieHeader()
    const buvid = anonymousBuvid()
    const body = (await bilibiliProxyRequest({
        url: "https://api.bilibili.com/x/web-interface/nav",
        cookie: cookie || undefined,
        buvid,
    })) as BilibiliNavEnvelope
    if (body.code != null && body.code !== 0) {
        return { loggedIn: false, account: null }
    }
    return authStatusFromNav(body.data ?? {})
}

function signAppParams(
    params: Record<string, string>,
    appKey: string,
    appSecret: string,
): Record<string, string> {
    const signed: Record<string, string> = {
        ...params,
        appkey: appKey,
        ts: String(Math.floor(Date.now() / 1000)),
    }
    const query = Object.keys(signed)
        .sort()
        .map((key) => {
            const value = signed[key] ?? ""
            const encodedKey = encodeURIComponent(key)
            return value === ""
                ? encodedKey
                : `${encodedKey}=${encodeURIComponent(value)}`
        })
        .join("&")
    return {
        ...signed,
        sign: CryptoJS.MD5(query + appSecret).toString(),
    }
}

function signedAppParams(params: Record<string, string>): Record<string, string> {
    return signAppParams(params, LOGIN_APP_KEY, LOGIN_APP_SECRET)
}

function signedTvLoginParams(
    params: Record<string, string>,
): Record<string, string> {
    return signAppParams(params, TV_APP_KEY, TV_APP_SECRET)
}

function encryptWithPublicKey(value: string, publicKeyPem: string): string {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem)
    return forge.util.encode64(publicKey.encrypt(value, "RSAES-PKCS1-V1_5"))
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

async function applyLoginData(
    data: BilibiliLoginData,
): Promise<BilibiliAccount | null> {
    const accountCookie = loginCookie(data)
    if (
        !accountCookie ||
        !parseCookiePairs(accountCookie).has("SESSDATA") ||
        !data.token_info
    ) {
        throw new Error("B站登录成功响应缺少账号凭据")
    }
    const cookie = mergeAnonymousCookie(accountCookie)
    await setBilibiliCookie(cookie)
    writeTvTokenInfo(data.token_info)
    return accountFromCookie(cookie)
}

function passportHeaders(): { cookie: string; buvid: string } {
    return {
 cookie: anonymousCookie(),
        buvid: anonymousBuvid(),
    }
}

async function passportRaw<T>(
    path: string,
    method: "GET" | "POST",
    params?: Record<string, string>,
    useTvSign = false,
    postQuery = false,
): Promise<BilibiliPassportResponse<T>> {
    const integrated = getApiSettings().mode === "integrated"
    const signed = params
        ? integrated
            ? useTvSign
                ? signedTvLoginParams(params)
                : signedAppParams(params)
            : params
        : undefined
    const query =
        (method === "GET" || postQuery) && signed
            ? `?${new URLSearchParams(signed).toString()}`
            : ""
    return (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${path}${query}`,
        method,
        body: method === "POST" && !postQuery ? signed : undefined,
 ...passportHeaders(),
    })) as BilibiliPassportResponse<T>
}

async function passportRequest<T>(
    path: string,
    method: "GET" | "POST",
    params?: Record<string, string>,
    useTvSign = false,
    postQuery = false,
): Promise<T> {
    const response = await passportRaw<T>(
        path,
        method,
        params,
        useTvSign,
        postQuery,
    )
    if (response.code !== 0 || response.data === undefined) {
        throw new BilibiliPassportError(
            response.message?.trim() || "B站登录请求失败",
            response.code ?? -1,
            response.data,
        )
    }
    return response.data
}

function trustedPassportUrl(
    raw: string,
    pathPrefix: string,
    hosts = TRUSTED_VERIFICATION_HOSTS,
): URL {
    const url = new URL(raw)
    if (
        url.protocol !== "https:" ||
        !hosts.has(url.hostname) ||
        !url.pathname.startsWith(pathPrefix) ||
        url.username ||
        url.password
    ) {
        throw new Error("B站返回了不受信任的验证地址")
    }
    return url
}

function geetestChallengeFromUrl(
    raw: string,
    pathPrefix: string,
): BilibiliGeetestChallenge {
    const url = trustedPassportUrl(raw, pathPrefix)
    const gt = url.searchParams.get("gee_gt") ?? ""
    const challenge = url.searchParams.get("gee_challenge") ?? ""
    const recaptchaToken = url.searchParams.get("recaptcha_token") ?? ""
    if (!gt || !challenge || !recaptchaToken) {
        throw new Error("B站极验参数不完整")
    }
    return { gt, challenge, recaptchaToken }
}

function passwordCaptcha(
    error: unknown,
): BilibiliGeetestChallenge | null {
    if (!(error instanceof BilibiliPassportError)) {
        return null
    }
    if (error.code !== PASSWORD_CAPTCHA_CODE) {
        return null
    }
    const data = error.data as BilibiliCaptchaData | undefined
    const raw = data?.url?.trim()
    return raw ? geetestChallengeFromUrl(raw, "/h5-app/passport/") : null
}

function riskLoginFromData(data: BilibiliLoginData): BilibiliRiskLogin {
    const rawUrl = data.url?.trim()
    if (!rawUrl) {
        throw new Error(data.message || "登录环境需要手机号验证，但缺少验证信息")
    }
    const url = trustedPassportUrl(
        rawUrl,
        "/h5-app/passport/risk/verify",
        TRUSTED_LOGIN_HOSTS,
    )
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
        ...passportHeaders(),
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
        ...passportHeaders(),
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
        ...passportHeaders(),
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
    const existingCookie = readCookieHeader()
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
        ...passportHeaders(),
    })) as {
        code?: number
        message?: string
        data?: { code?: string }
    }
    const oauthCode = verification.data?.code
    if (verification.code !== 0 || !oauthCode) {
        throw new Error(verification.message?.trim() || "手机号验证失败")
    }

    const buvid = anonymousBuvid()
    const loginData = await passportRequest<BilibiliLoginData>(
        OAUTH_TOKEN_PATH,
        "POST",
        {
            build: "2001100",
            buvid,
            code: oauthCode,
            disable_rcmd: "0",
            grant_type: "authorization_code",
            local_id: buvid,
            mobi_app: "android_hd",
            platform: "android",
        },
    )
    const fallback = await applyLoginData(loginData)
    return completeBilibiliLogin(fallback, existingCookie)
}

async function createBilibiliQrLogin(): Promise<{
    url: string
    key: string
}> {
 const body = await passportRequest<BilibiliQrData>(
 QR_AUTH_CODE_PATH,
 "POST",
 {
 local_id: "0",
 platform: "android",
 mobi_app: "android_hd",
 },
 true,
 true,
 )
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
    statusResult?: BilibiliAuthStatus
}> {
 const existingCookie = readCookieHeader()
 const params = { auth_code: key, local_id: "0" }
 const signed =
 getApiSettings().mode === "integrated"
 ? signedTvLoginParams(params)
 : params
 const query = new URLSearchParams(signed).toString()
    const response = (await bilibiliProxyRequest({
 url: `https://passport.bilibili.com${QR_POLL_PATH}?${query}`,
 method: "POST",
 ...passportHeaders(),
    })) as {
        code?: number
        message?: string
        data?: BilibiliQrData
    }
    const code = response.code
    if (code === 0) {
        const fallback = await applyLoginData(response.data ?? {})
        const status = await completeBilibiliLogin(fallback, existingCookie)
        return {
            status: "confirmed",
            message: response.message,
            statusResult: status,
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
 return { status: "waiting", message: response.message }
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

function commonLoginParams(mode: "password" | "sms"): Record<string, string> {
    const device = deviceId()
    const buvid = anonymousBuvid()
    return {
        bili_local_id: device,
        build: "2001100",
        buvid,
        c_locale: "zh_CN",
        channel: "master",
        device: "phone",
        device_id: device,
        device_name: "vivo",
        device_platform: "Android14vivo",
        disable_rcmd: "0",
        from_pv:
            mode === "password"
                ? "main.homepage.avatar-nologin.all.click"
                : "main.my-information.my-login.0.click",
        from_url: encodeURIComponent(
            mode === "password"
                ? "bilibili://pegasus/promo"
                : "bilibili://user_center/mine",
        ),
        local_id: buvid,
        mobi_app: "android_hd",
        platform: "android",
        s_locale: "zh_CN",
        statistics: LOGIN_STATISTICS,
    }
}

function verificationParams(
    verification?: BilibiliGeetestVerification,
): Record<string, string> {
    if (!verification) {
        return {}
    }
    return {
        gee_challenge: verification.challengeResult,
        gee_seccode: verification.seccode,
        gee_validate: verification.validate,
        recaptcha_token: verification.challenge.recaptchaToken,
    }
}

async function loginBilibiliWithPassword(
    username: string,
    password: string,
    verification?: BilibiliGeetestVerification,
): Promise<BilibiliPasswordLoginResult> {
    const existingCookie = readCookieHeader()
    const loginKey = await getBilibiliLoginKey()
    const params = {
        ...commonLoginParams("password"),
        ...verificationParams(verification),
        permission: "ALL",
        username: username.trim(),
        password: encryptWithPublicKey(
            `${loginKey.hash}${password}`,
            loginKey.key,
        ),
        dt: encodeURIComponent(
            encryptWithPublicKey(randomLoginString(16), loginKey.key),
        ),
    }
    const response = await passportRaw<BilibiliLoginData>(
        PASSWORD_LOGIN_PATH,
        "POST",
        params,
    )
    if (response.code !== 0) {
        const error = new BilibiliPassportError(
            response.message?.trim() || "B站登录请求失败",
            response.code ?? -1,
            response.data,
        )
        const challenge = passwordCaptcha(error)
        if (challenge) {
            return { type: "captcha", challenge }
        }
        throw error
    }
    const data = response.data
    if (!data) {
        throw new Error(response.message?.trim() || "B站登录响应无效")
    }
    if (data.status === 2) {
        const risk = await getBilibiliRiskLoginInfo(riskLoginFromData(data))
        return { type: "risk", risk }
    }
    const fallback = await applyLoginData(data)
    return {
        type: "complete",
        status: await completeBilibiliLogin(fallback, existingCookie),
    }
}

function smsCaptcha(
    code: number | undefined,
    data: BilibiliCaptchaData | undefined,
): BilibiliGeetestChallenge | null {
    if (code !== 0 && code !== PASSWORD_CAPTCHA_CODE) {
        return null
    }
    const raw = data?.recaptcha_url?.trim() || data?.url?.trim()
    return raw ? geetestChallengeFromUrl(raw, "/h5-app/passport/") : null
}

async function fallbackSmsCaptcha(): Promise<BilibiliGeetestChallenge> {
    const response = (await bilibiliProxyRequest({
        url: `https://passport.bilibili.com${RISK_CAPTCHA_PATH}`,
        method: "POST",
        ...passportHeaders(),
    })) as {
        code?: number
        message?: string
        data?: {
            gee_gt?: string
            gee_challenge?: string
            recaptcha_token?: string
        }
    }
    const data = response.data
    if (
        response.code !== 0 ||
        !data?.gee_gt ||
        !data.gee_challenge ||
        !data.recaptcha_token
    ) {
        throw new BilibiliPassportError(
            response.message?.trim() || "获取极验参数失败",
            response.code ?? -1,
            response.data,
        )
    }
    return {
        gt: data.gee_gt,
        challenge: data.gee_challenge,
        recaptchaToken: data.recaptcha_token,
    }
}

async function sendBilibiliSmsCode(
    phone: string,
    verification?: BilibiliGeetestVerification,
): Promise<BilibiliSmsSendResult> {
    const buvid = anonymousBuvid()
    const timestamp = Date.now()
    const params = {
        build: "2001100",
        buvid,
        c_locale: "zh_CN",
        channel: "master",
        cid: "86",
        disable_rcmd: "0",
        ...verificationParams(verification),
        local_id: buvid,
        login_session_id: CryptoJS.MD5(`${buvid}${timestamp}`).toString(),
        mobi_app: "android_hd",
        platform: "android",
        s_locale: "zh_CN",
        statistics: LOGIN_STATISTICS,
        tel: phone.trim(),
    }
    const response = await passportRaw<{
        captcha_key?: string
        recaptcha_url?: string
        url?: string
    }>(SMS_SEND_PATH, "POST", params)
    if (
        response.code === 0 &&
        response.data?.captcha_key &&
        !response.data.recaptcha_url
    ) {
        return { type: "sent", captchaKey: response.data.captcha_key }
    }
    if (response.code === 0 || response.code === PASSWORD_CAPTCHA_CODE) {
        if (
            verification &&
            response.code === 0 &&
            !response.data?.captcha_key
        ) {
            throw new BilibiliPassportError(
                response.message?.trim() || "安全验证未通过，请重试",
                response.code ?? -1,
                response.data,
            )
        }
        const challenge =
            smsCaptcha(response.code, response.data) ??
            (await fallbackSmsCaptcha())
        return { type: "captcha", challenge }
    }
    throw new BilibiliPassportError(
        response.message?.trim() || "B站没有返回验证码凭据",
        response.code ?? -1,
        response.data,
    )
}

async function loginBilibiliWithSms(input: {
    phone: string
    code: string
    captchaKey: string
}): Promise<BilibiliAuthStatus> {
    const existingCookie = readCookieHeader()
    const loginKey = await getBilibiliLoginKey()
    const data = await passportRequest<BilibiliLoginData>(
        SMS_LOGIN_PATH,
        "POST",
        {
            ...commonLoginParams("sms"),
            captcha_key: input.captchaKey,
            cid: "86",
            code: input.code.trim(),
            tel: input.phone.trim(),
            dt: encodeURIComponent(
                encryptWithPublicKey(randomLoginString(16), loginKey.key),
            ),
        },
    )
    const fallback = await applyLoginData(data)
    return completeBilibiliLogin(fallback, existingCookie)
}

async function completeBilibiliLogin(
    fallback?: BilibiliAccount | null,
    previousCookie = "",
): Promise<BilibiliAuthStatus> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const status = await fetchBilibiliAuthStatus()
            if (status.loggedIn) {
                window.dispatchEvent(new CustomEvent(AUTH_EVENT))
                return status
            }
        } catch {
            // A freshly issued cookie can still be propagating on the account edge
        }
        if (attempt < 2) {
            await new Promise((resolve) =>
                window.setTimeout(resolve, 350 * (attempt + 1)),
            )
        }
    }
    const account = fallback ?? accountFromCookie(readCookieHeader())
    if (account) {
        window.dispatchEvent(new CustomEvent(AUTH_EVENT))
        return { loggedIn: true, account }
    }
    if (previousCookie) {
        await setBilibiliCookie(previousCookie)
    }
    throw new Error("登录状态检查失败，请重试")
}

async function validateCookie(
    cookieHeader: string,
): Promise<BilibiliAuthStatus> {
    const body = (await bilibiliProxyRequest({
        url: `https://api.bilibili.com${MEMBER_ACCOUNT_PATH}`,
        cookie: cookieHeader,
        buvid: anonymousBuvid(),
    })) as BilibiliNavEnvelope & { data?: BilibiliMemberData }
    if (body.code !== 0 || !body.data) {
        throw new Error(body.message?.trim() || "登录已失效，请重新登录")
    }
    return authStatusFromMember(body.data)
}

async function saveBilibiliCookie(
    cookieHeader: string,
): Promise<BilibiliAuthStatus> {
    const normalized = mergeAnonymousCookie(normalizeCookieInput(cookieHeader))
    const pairs = parseCookiePairs(normalized)
    if (!pairs.has("SESSDATA")) {
        throw new Error("登录信息不完整，请重试")
    }
    let status: BilibiliAuthStatus
    try {
        status = await validateCookie(normalized)
    } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (!message.includes("不支持") && !message.includes("HTTP 404")) {
            throw error
        }
        await setBilibiliCookie(normalized)
        return completeBilibiliLogin(accountFromCookie(normalized))
    }
    await setBilibiliCookie(normalized)
    window.dispatchEvent(new CustomEvent(AUTH_EVENT))
    return status
}

async function logoutBilibili(): Promise<void> {
    if (isTauriRuntime() && getApiSettings().mode === "integrated") {
        await invoke("bilibili_clear_cookie").catch(() => undefined)
    }
    writeCookieHeader("")
    writeStorage(TOKEN_STORAGE_KEY, "")
}

export {
    AUTH_EVENT,
    QR_LOGIN_LIFETIME_MS,
    QR_POLL_INTERVAL_MS,
    completeBilibiliLogin,
    completeBilibiliRiskLogin,
    createBilibiliQrLogin,
    fetchBilibiliAuthStatus,
    getBilibiliLoginKey,
    getBilibiliRiskGeetest,
    loginBilibiliWithPassword,
    loginBilibiliWithSms,
    logoutBilibili,
    pollBilibiliQrLogin,
    readCookieHeader,
    saveBilibiliCookie,
    sendBilibiliRiskSms,
    sendBilibiliSmsCode,
}
