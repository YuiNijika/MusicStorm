// 应用内置网易云 API：TS 加密 + 模块映射 + Tauri HTTP 代理
// 详细对齐 CloudMusicAPI 扫码登录差异：eapi 走 interfacepc、deviceId 52-hex、pc cookie appver、UA 一致

import { invoke } from "@tauri-apps/api/core"

import { upgradeNeteaseUrls } from "@/lib/music/upgrade-url"
import { getNeteaseCookieParam } from "@/lib/netease/auth-cookie"
import {
    buildAnonymousUsername,
    cookieHeader,
    cookieToRecord,
    DESKTOP_UA_APPVER,
    eapiHeaderCookie,
    ensureDeviceCookies,
    getOrCreateDeviceId,
    getStoredMusicA,
    PC_APPVER,
    storeMusicA,
} from "@/lib/netease/native/device-cookie"
import { resolveNativeModule } from "@/lib/netease/native/modules"
import { resolveRealIp } from "@/lib/netease/native/real-ip"

// weapi/eapi 加密较重，首个加密请求时才懒加载
let cryptoModule: Promise<typeof import("@/lib/netease/native/crypto")> | null = null
function loadCrypto() {
    cryptoModule ??= import("@/lib/netease/native/crypto")
    return cryptoModule
}

const DOMAIN = "https://music.163.com"
// CloudMusicAPI APP_CONF.eapiDomain — PC 客户端 eapi，扫码 unikey 必须走这域
const EAPI_DOMAIN = "https://interfacepc.music.163.com"

// eapi 桌面设备头 UA：NeteaseMusicDesktop 形态，与 eapi pc 设备头一致
const UA_PC = `Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/${DESKTOP_UA_APPVER}`

// weapi 是网页端接口，对齐 Node 版 request.js 的 chooseUserAgent('weapi')：浏览器 UA
const UA_WEB = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0`

type Query = Record<string, string | number | boolean | undefined>

type ProxyResponse = {
    status: number
    body: string
    cookies: string[]
}

let anonymousBoot: Promise<void> | null = null

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function formBody(data: Record<string, string>): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(data)) {
        params.set(key, value)
    }
    return params.toString()
}

function isLoginPath(path: string, uri: string): boolean {
    return path.includes("login") || uri.includes("login")
}

function extractMusicA(cookies: string[], bodyText?: string): string | null {
    for (const c of cookies) {
        const m = /^MUSIC_A=(.*)$/i.exec(c.trim())
        if (m?.[1]) {
            return m[1]
        }
    }
    if (!bodyText) {
        return null
    }
    try {
        const parsed = JSON.parse(bodyText || "{}") as { cookie?: string }
        if (typeof parsed.cookie === "string") {
            const fromBody = cookieToRecord(parsed.cookie.replace(/;;/g, ";"))
            if (fromBody.MUSIC_A) {
                return fromBody.MUSIC_A
            }
        }
    } catch {
        // cookie 解析失败时按无 cookie 处理，后续请求仍会带自己的凭证
    }
    return null
}

async function proxyPost(input: {
    url: string
    body: string
    cookie?: string
    userAgent?: string
    referer?: string | null
    origin?: string | null
    realIp?: string
}): Promise<ProxyResponse> {
    if (!isTauriRuntime()) {
        throw new Error(
            "内置 API 需在桌面应用中运行；浏览器请切换到「对接 API」",
        )
    }
    return invoke<ProxyResponse>("netease_http_post", {
        url: input.url,
        body: input.body,
        cookie: input.cookie ?? null,
        userAgent: input.userAgent ?? null,
        referer: input.referer ?? null,
        origin: input.origin ?? null,
        realIp: input.realIp ?? resolveRealIp(),
    })
}

/**
 * 注册游客 MUSIC_A。
 * deviceId 必须与后续 unikey/check 完全相同，否则 App 会提示「登录有风险」。
 */
async function ensureAnonymousToken(): Promise<void> {
    if (getStoredMusicA()) {
        return
    }
    const session = getNeteaseCookieParam()
    if (session?.includes("MUSIC_U=")) {
        return
    }
    if (!isTauriRuntime()) {
        return
    }
    if (!anonymousBoot) {
        anonymousBoot = (async () => {
            try {
                const deviceId = getOrCreateDeviceId()
                const username = buildAnonymousUsername(deviceId)
                const jar = ensureDeviceCookies(
                    { deviceId },
                    { isLoginPath: false },
                )
                // 确保 jar.deviceId 就是注册用的那枚
                jar.deviceId = deviceId

                const { weapi } = await loadCrypto()
                const encrypted = weapi({ username })
                const response = await proxyPost({
                    url: `${DOMAIN}/weapi/register/anonimous`,
                    body: formBody(encrypted),
                    cookie: cookieHeader(jar),
                    userAgent: UA_PC,
                    referer: DOMAIN,
                    origin: DOMAIN,
                    realIp: resolveRealIp(),
                })

                const musicA = extractMusicA(response.cookies, response.body)
                if (musicA) {
                    storeMusicA(musicA)
                    return
                }

                // weapi 失败时再试 eapi（部分环境 weapi 匿名已收紧）
                const header: Record<string, string> = {
                    osver: jar.osver || "",
                    deviceId,
                    os: jar.os || "pc",
                    appver: jar.appver || PC_APPVER,
                    versioncode: jar.versioncode || "140",
                    mobilename: jar.mobilename || "",
                    buildver: String(Date.now()).slice(0, 10),
                    resolution: jar.resolution || "1920x1080",
                    __csrf: "",
                    channel: "netease",
                    requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
                        .toString()
                        .padStart(4, "0")}`,
                }
                const eapiData = { username, header }
                const { eapi } = await loadCrypto()
                const eapiEnc = eapi("/api/register/anonimous", eapiData)
                const eapiRes = await proxyPost({
                    url: `${EAPI_DOMAIN}/eapi/register/anonimous`,
                    body: formBody(eapiEnc),
                    cookie: eapiHeaderCookie(header),
                    userAgent: UA_PC,
                    referer: null,
                    origin: null,
                    realIp: resolveRealIp(),
                })
                const musicA2 = extractMusicA(eapiRes.cookies, eapiRes.body)
                if (musicA2) {
                    storeMusicA(musicA2)
                }
            } catch {
                anonymousBoot = null
            }
        })()
    }
    await anonymousBoot
}

async function nativeNeteaseRequest<T>(
    path: string,
    query: Query = {},
): Promise<T> {
    await ensureAnonymousToken()

    const spec = resolveNativeModule(path, query)

    if (spec.crypto === "local") {
        return (spec.localBody ?? { code: 200 }) as T
    }

    const login = isLoginPath(path, spec.uri)
    const jar = ensureDeviceCookies(cookieToRecord(getNeteaseCookieParam()), {
        isLoginPath: login,
    })
    if (typeof query.cookie === "string" && query.cookie) {
        Object.assign(jar, cookieToRecord(query.cookie))
        // 透传后仍强制 deviceId 与全局一致
        jar.deviceId = getOrCreateDeviceId()
    }

    const csrf = jar.__csrf || ""
    const data: Record<string, unknown> = { ...spec.data }
    const realIp = resolveRealIp(query.realIP)
    const deviceId = jar.deviceId || getOrCreateDeviceId()

    if (spec.crypto === "weapi") {
        data.csrf_token = csrf
        const { weapi } = await loadCrypto()
        const encrypted = weapi(data)
        const response = await proxyPost({
            url: `${DOMAIN}/weapi/${spec.uri.replace(/^\/api\//, "")}`,
            body: formBody(encrypted),
            cookie: cookieHeader(jar),
            userAgent: UA_WEB,
            referer: DOMAIN,
            origin: null,
            realIp,
        })
        return parseProxyBody<T>(path, response)
    }

    if (spec.crypto === "eapi") {
        const header: Record<string, string> = {
            osver: jar.osver || "Microsoft-Windows-10-Professional-build-19045-64bit",
            deviceId,
            os: jar.os || "pc",
            appver: jar.appver || PC_APPVER,
            versioncode: jar.versioncode || "140",
            mobilename: jar.mobilename || "",
            buildver: jar.buildver || String(Date.now()).slice(0, 10),
            resolution: jar.resolution || "1920x1080",
            __csrf: csrf,
            channel: jar.channel || "netease",
            requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
                .toString()
                .padStart(4, "0")}`,
        }
        if (jar.MUSIC_U) {
            header.MUSIC_U = jar.MUSIC_U
        }
        if (jar.MUSIC_A) {
            header.MUSIC_A = jar.MUSIC_A
        }
        data.header = header
        const { eapi } = await loadCrypto()
        const encrypted = eapi(spec.uri, data)
        // 登录 eapi：与 CloudMusicAPI 一样不带 Origin/Referer，UA 用 iphone 默认
        const responseEapi = await proxyPost({
            url: `${EAPI_DOMAIN}/eapi/${spec.uri.replace(/^\/api\//, "")}`,
            body: formBody(encrypted),
            cookie: eapiHeaderCookie(header),
            userAgent: UA_PC,
            referer: login ? null : DOMAIN,
            origin: login ? null : DOMAIN,
            realIp,
        })
        return parseProxyBody<T>(path, responseEapi)
    }

    const response = await proxyPost({
        url: `${DOMAIN}${spec.uri}`,
        body: formBody(
            Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v ?? "")]),
            ),
        ),
        cookie: cookieHeader(jar),
        userAgent: UA_PC,
        referer: DOMAIN,
        origin: DOMAIN,
        realIp,
    })
    return parseProxyBody<T>(path, response)
}

function parseProxyBody<T>(path: string, response: ProxyResponse): T {
    if (response.status >= 500) {
        throw new Error(`内置 API HTTP ${response.status}`)
    }

    let parsed: unknown
    try {
        // 网易云封面仍是 http 地址，macOS WKWebView 会按 ATS 拒绝，统一升级后再透传
        parsed = upgradeNeteaseUrls(JSON.parse(response.body || "{}"))
    } catch {
        const snippet = response.body.slice(0, 80)
        throw new Error(
            snippet
                ? `内置 API 响应不是 JSON: ${snippet}`
                : "内置 API 响应不是 JSON",
        )
    }

    if (
        Array.isArray(response.cookies) &&
        response.cookies.length > 0 &&
        parsed &&
        typeof parsed === "object"
    ) {
        const bodyObj = parsed as Record<string, unknown>
        if (bodyObj.cookie == null) {
            bodyObj.cookie = response.cookies.join(";;")
        }
        const musicA = extractMusicA(response.cookies)
        if (musicA) {
            storeMusicA(musicA)
        }
    }

    if (path === "/login/qr/key" && parsed && typeof parsed === "object") {
        const raw = parsed as Record<string, unknown>
        if (raw.unikey != null && raw.data == null) {
            return { code: 200, data: raw } as T
        }
        if (raw.data == null && raw.code == null) {
            return { code: 200, data: raw } as T
        }
    }

    return parsed as T
}

export { isTauriRuntime, nativeNeteaseRequest }