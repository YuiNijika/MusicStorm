import { invoke } from "@tauri-apps/api/core"

import { getApiSettings, getBilibiliBaseUrl } from "@/lib/netease/api-settings"
import { isTauriRuntime } from "@/lib/platform"

type ProxyMethod = "GET" | "POST" | "PATCH" | "DELETE"

type ProxyInput = {
    url: string
    method?: ProxyMethod
    body?: Record<string, string | number | boolean | undefined>
    referer?: string
    cookie?: string
    buvid?: string
}

const ROUTE_MAP: Record<string, string> = {
    "/x/web-interface/nav": "/auth/nav",
    "/x/member/web/account": "/member/account",
    "/x/passport-tv-login/qrcode/auth_code": "/auth/qrcode/generate",
    "/x/passport-tv-login/qrcode/poll": "/auth/qrcode/poll",
    "/x/passport-login/web/key": "/auth/login/key",
    "/x/passport-login/oauth2/login": "/auth/login/password",
    "/x/passport-login/sms/send": "/auth/login/sms/send",
    "/x/passport-login/login/sms": "/auth/login/sms",
    "/x/safecenter/user/info": "/auth/risk/info",
    "/x/safecenter/captcha/pre": "/auth/risk/captcha",
    "/x/safecenter/common/sms/send": "/auth/risk/sms/send",
    "/x/safecenter/login/tel/verify": "/auth/risk/sms/verify",
    "/x/passport-login/oauth2/access_token": "/auth/login/access-token",
    "/x/passport-login/web/cookie/info": "/auth/cookie/info",
    "/x/passport-login/web/cookie/refresh": "/auth/cookie/refresh",
    "/x/passport-login/web/confirm/refresh": "/auth/cookie/confirm-refresh",
    "/x/web-interface/wbi/search/type": "/search",
    "/x/web-interface/popular": "/popular",
 "/x/web-interface/card": "/user/card",
    "/x/web-interface/ranking/v2": "/ranking",
 "/x/polymer/web-space/seasons_series_list": "/seasons/series",
 "/x/polymer/web-space/seasons_archives_list": "/seasons/archives",
 "/x/series/archives": "/seasons/series-archives",
    "/x/web-interface/view": "/video",
    "/x/player/wbi/playurl": "/player",
    "/audio/music-service-c/web/song/info": "/audio/info",
    "/audio/music-service-c/url": "/audio/url",
    "/x/v3/fav/folder/created/list": "/favorites/folders",
    "/x/v3/fav/folder/created/list-all": "/favorites/folders",
    "/x/v3/fav/folder/info": "/favorites/folder/info",
    "/x/v3/fav/resource/list": "/favorites/resources",
    "/x/web-interface/history/cursor": "/history",
}

function readCookieHeader(): string {
    if (typeof window === "undefined") return ""
    try {
        return window.localStorage.getItem("musicstorm-bilibili-cookie") ?? ""
    } catch {
        return ""
    }
}

function externalPath(url: URL): string {
    const route = ROUTE_MAP[url.pathname]
    if (!route) {
        throw new Error(`B站对接模式不支持接口 ${url.pathname}`)
    }
    return route
}

function normalizeExternalResponse(body: unknown): unknown {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("B站对接接口响应格式无效")
    }
    const envelope = body as {
        success?: boolean
        message?: string
        data?: {
            upstreamCode?: number
            upstreamMessage?: string
            data?: unknown
            cookie?: string
        }
    }
    const payload = envelope.data
    if (!envelope.success) {
        const error = new Error(
            payload?.upstreamMessage ||
                envelope.message ||
                "B站对接接口请求失败",
        ) as Error & { code?: number; data?: unknown }
        error.code = payload?.upstreamCode
        error.data = payload?.data
        throw error
    }
    return {
        code: payload?.upstreamCode ?? 0,
        message: payload?.upstreamMessage ?? envelope.message ?? "OK",
        data: payload?.data,
        cookie: payload?.cookie,
    }
}

async function bilibiliProxyRequest(input: ProxyInput): Promise<unknown> {
    const settings = getApiSettings()
    if (settings.mode === "integrated") {
        if (!isTauriRuntime()) {
            throw new Error("B站内置模式需在桌面应用中运行，请切换到对接模式")
        }
        if ((input.method ?? "GET") === "POST") {
            return invoke<unknown>("bilibili_post_json", {
                url: input.url,
                body: input.body ?? null,
                refererUrl: input.referer ?? null,
                cookie: input.cookie ?? (readCookieHeader() || null),
                buvid: input.buvid ?? null,
            })
        }
        if ((input.method ?? "GET") !== "GET") {
            throw new Error("B站内置模式暂不支持此请求方法")
        }
        return invoke<unknown>("bilibili_get_json", {
            url: input.url,
            cookie: input.cookie ?? (readCookieHeader() || null),
            buvid: input.buvid ?? null,
        })
    }

    const upstreamUrl = new URL(input.url)
    const baseUrl = getBilibiliBaseUrl().replace(/\/+$/, "") + "/"
    const target = new URL(
        externalPath(upstreamUrl).replace(/^\/+/, ""),
        baseUrl,
    )
    for (const [key, value] of upstreamUrl.searchParams) {
        target.searchParams.set(key, value)
    }
    const method = input.method ?? "GET"
    const headers: Record<string, string> = {
        Accept: "application/json",
    }
    const cookie = input.cookie ?? readCookieHeader()
    if (cookie) {
        headers["X-Bilibili-Cookie"] = cookie
    }
    if (input.buvid) {
        headers["X-Bilibili-Buvid"] = input.buvid
    }
    const body =
        method === "GET" || !input.body
            ? undefined
            : new URLSearchParams(
                  Object.entries(input.body)
                      .filter(([, value]) => value !== undefined)
                      .map(([key, value]) => [key, String(value)]),
              ).toString()
    const requestBody =
        body && input.referer
            ? new URLSearchParams([
                  ...new URLSearchParams(body).entries(),
                  ["referer_url", input.referer],
              ]).toString()
            : body
    if (body) {
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    }
    const response = await fetch(target, {
        method,
        headers,
        body: requestBody,
        credentials: "omit",
    })
    const json = (await response.json()) as unknown
    if (!response.ok) {
        throw new Error(`B站对接接口 HTTP ${response.status}`)
    }
    return normalizeExternalResponse(json)
}

async function bilibiliProxyGet(url: string): Promise<unknown> {
    return bilibiliProxyRequest({ url })
}

export { bilibiliProxyGet, bilibiliProxyRequest }
