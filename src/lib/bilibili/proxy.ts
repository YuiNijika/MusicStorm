import { invoke } from "@tauri-apps/api/core"

import { getApiSettings, getBilibiliBaseUrl } from "@/lib/netease/api-settings"
import { isTauriRuntime } from "@/lib/platform"

type ProxyMethod = "GET" | "POST" | "PATCH" | "DELETE"

type ProxyInput = {
    url: string
    method?: ProxyMethod
    body?: Record<string, string | number | boolean | undefined>
}

const ROUTE_MAP: Record<string, string> = {
    "/x/web-interface/nav": "/auth/nav",
    "/x/passport-login/web/qrcode/generate": "/auth/qrcode/generate",
    "/x/passport-login/web/qrcode/poll": "/auth/qrcode/poll",
    "/x/passport-login/web/cookie/info": "/auth/cookie/info",
    "/x/passport-login/web/cookie/refresh": "/auth/cookie/refresh",
    "/x/passport-login/web/confirm/refresh": "/auth/cookie/confirm-refresh",
    "/x/web-interface/wbi/search/type": "/search",
    "/x/web-interface/popular": "/popular",
    "/x/web-interface/ranking/v2": "/ranking",
    "/x/web-interface/view": "/video",
    "/x/player/wbi/playurl": "/player",
    "/audio/music-service-c/web/song/info": "/audio/info",
    "/audio/music-service-c/url": "/audio/url",
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
        ) as Error & { code?: number }
        error.code = payload?.upstreamCode
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
        if ((input.method ?? "GET") !== "GET") {
            throw new Error("B站内置模式暂不支持此写操作")
        }
        return invoke<unknown>("bilibili_get_json", { url: input.url })
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
    const cookie = readCookieHeader()
    if (cookie) {
        headers["X-Bilibili-Cookie"] = cookie
    }
    const body =
        method === "GET" || !input.body
            ? undefined
            : new URLSearchParams(
                  Object.entries(input.body)
                      .filter(([, value]) => value !== undefined)
                      .map(([key, value]) => [key, String(value)]),
              ).toString()
    if (body) {
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    }
    const response = await fetch(target, {
        method,
        headers,
        body,
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
