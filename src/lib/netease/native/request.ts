/**
 * 应用内置网易云 API：TS 加密 + 模块映射 + Tauri HTTP 代理
 * 对齐 CloudMusicAPI 的 weapi/eapi 请求形态。
 */

import { invoke } from "@tauri-apps/api/core"

import { getNeteaseCookieParam } from "@/lib/netease/auth-cookie"
import { eapi, weapi } from "@/lib/netease/native/crypto"
import { resolveNativeModule } from "@/lib/netease/native/modules"
import { resolveRealIp } from "@/lib/netease/native/real-ip"

const DOMAIN = "https://music.163.com"
const EAPI_DOMAIN = "https://interface3.music.163.com"

const UA_WEAPI =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
const UA_EAPI =
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117"

type Query = Record<string, string | number | boolean | undefined>

type ProxyResponse = {
    status: number
    body: string
    cookies: string[]
}

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function cookieToRecord(cookie: string | null): Record<string, string> {
    const out: Record<string, string> = {}
    if (!cookie) {
        return out
    }
    for (const part of cookie.split(";")) {
        const idx = part.indexOf("=")
        if (idx <= 0) {
            continue
        }
        const key = part.slice(0, idx).trim()
        const value = part.slice(idx + 1).trim()
        if (key) {
            out[key] = value
        }
    }
    return out
}

function ensureDeviceCookies(jar: Record<string, string>): Record<string, string> {
    const next = { ...jar }
    if (!next.os) {
        next.os = "pc"
    }
    if (!next.appver) {
        next.appver = "3.1.17.204416"
    }
    if (!next.osver) {
        next.osver = "Microsoft-Windows-10-Professional-build-19045-64bit"
    }
    if (!next.deviceId) {
        next.deviceId = "pafxhud3s9_MusicStorm"
    }
    if (!next.channel) {
        next.channel = "netease"
    }
    return next
}

function cookieHeader(jar: Record<string, string>): string {
    return Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ")
}

function formBody(data: Record<string, string>): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(data)) {
        params.set(key, value)
    }
    return params.toString()
}

async function proxyPost(input: {
    url: string
    body: string
    cookie?: string
    userAgent?: string
    referer?: string
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
        realIp: input.realIp ?? resolveRealIp(),
    })
}

/**
 * 执行一条与 CloudMusicAPI 等价的内置请求。
 * 返回 body JSON；登录类接口会把 cookie 数组挂到 body.cookie。
 */
async function nativeNeteaseRequest<T>(
    path: string,
    query: Query = {},
): Promise<T> {
    const spec = resolveNativeModule(path, query)

    if (spec.crypto === "local") {
        return (spec.localBody ?? { code: 200 }) as T
    }

    const jar = ensureDeviceCookies(
        cookieToRecord(getNeteaseCookieParam()),
    )
    // query.cookie 优先 部分调用方可能透传
    if (typeof query.cookie === "string" && query.cookie) {
        Object.assign(jar, cookieToRecord(query.cookie))
    }

    const csrf = jar.__csrf || ""
    const data: Record<string, unknown> = { ...spec.data }

    let url = ""
    let body = ""
    let userAgent = UA_WEAPI
    let referer = DOMAIN

    if (spec.crypto === "weapi") {
        data.csrf_token = csrf
        const encrypted = weapi(data)
        url = `${DOMAIN}/weapi/${spec.uri.replace(/^\/api\//, "")}`
        body = formBody(encrypted)
        userAgent = UA_WEAPI
        referer = DOMAIN
    } else if (spec.crypto === "eapi") {
        const header = {
            osver: jar.osver,
            deviceId: jar.deviceId,
            os: jar.os,
            appver: jar.appver,
            versioncode: jar.versioncode || "140",
            mobilename: jar.mobilename || "",
            buildver: jar.buildver || String(Date.now()).slice(0, 10),
            resolution: jar.resolution || "1920x1080",
            __csrf: csrf,
            channel: jar.channel,
            requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
                .toString()
                .padStart(4, "0")}`,
            ...(jar.MUSIC_U ? { MUSIC_U: jar.MUSIC_U } : {}),
            ...(jar.MUSIC_A ? { MUSIC_A: jar.MUSIC_A } : {}),
        }
        data.header = header
        const encrypted = eapi(spec.uri, data)
        url = `${EAPI_DOMAIN}/eapi/${spec.uri.replace(/^\/api\//, "")}`
        body = formBody(encrypted)
        userAgent = UA_EAPI
        // eapi：Cookie 仅用 header 字段 对齐 CloudMusicAPI createHeaderCookie
        const eapiCookie = Object.fromEntries(
            Object.entries(header).map(([k, v]) => [k, String(v ?? "")]),
        )
        const responseEapi = await proxyPost({
            url,
            body,
            cookie: cookieHeader(eapiCookie),
            userAgent,
            referer,
            realIp: resolveRealIp(query.realIP),
        })
        return parseProxyBody<T>(path, responseEapi)
    } else {
        // 明文 api
        url = `${DOMAIN}${spec.uri}`
        body = formBody(
            Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v ?? "")]),
            ),
        )
    }

    const response = await proxyPost({
        url,
        body,
        cookie: cookieHeader(jar),
        userAgent,
        referer,
        realIp: resolveRealIp(query.realIP),
    })
    return parseProxyBody<T>(path, response)
}

function parseProxyBody<T>(path: string, response: ProxyResponse): T {
    if (response.status >= 500) {
        throw new Error(`内置 API HTTP ${response.status}`)
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(response.body || "{}")
    } catch {
        // eapi 偶发非 JSON：尝试报错原文片段
        const snippet = response.body.slice(0, 80)
        throw new Error(
            snippet
                ? `内置 API 响应不是 JSON: ${snippet}`
                : "内置 API 响应不是 JSON",
        )
    }

    // 登录 / 扫码：透传 set-cookie
    if (
        Array.isArray(response.cookies) &&
        response.cookies.length > 0 &&
        parsed &&
        typeof parsed === "object"
    ) {
        const bodyObj = parsed as Record<string, unknown>
        if (bodyObj.cookie == null) {
            // 与 setCookiesFromApi 约定：多段 Set-Cookie 用 ;; 分隔
            bodyObj.cookie = response.cookies.join(";;")
        }
    }

    // 对齐 login_qr_key 包装
    if (path === "/login/qr/key" && parsed && typeof parsed === "object") {
        const raw = parsed as Record<string, unknown>
        if (raw.unikey != null && raw.data == null) {
            return {
                code: 200,
                data: raw,
            } as T
        }
        if (raw.data == null && raw.code == null) {
            return { code: 200, data: raw } as T
        }
    }

    return parsed as T
}

export { isTauriRuntime, nativeNeteaseRequest }