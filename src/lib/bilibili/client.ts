import { bilibiliProxyGet } from "@/lib/bilibili/proxy"
import { clearWbiCache, signWbi, type WbiParams } from "@/lib/bilibili/wbi"
import { getApiSettings } from "@/lib/netease/api-settings"

type BilibiliEnvelope<T> = {
    code?: number
    message?: string
    msg?: string
    data?: T
}

type BilibiliPassportEnvelope<T> = {
 code?: number
 message?: string
 data?: T
 cookie?: string
}

type BilibiliRequestInput = {
    path: string
    params?: WbiParams
    wbi?: boolean
}

const RISK_CODES = new Set([-352, -401, -403, -412])

function normalizeValue(value: string | number | boolean): string {
    return String(value)
}

function buildUrl(path: string, params: WbiParams): string {
    const query = Object.keys(params)
        .map((key) => [key, params[key]] as const)
        .filter(([, value]) => value !== undefined)
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(normalizeValue(value))}`,
        )
        .join("&")
    return `https://api.bilibili.com${path}${query ? `?${query}` : ""}`
}

async function requestOnce<T>(
    input: BilibiliRequestInput,
    params: WbiParams,
): Promise<T> {
    const body = (await bilibiliProxyGet(
        buildUrl(input.path, params),
    )) as BilibiliEnvelope<T>
    const code = body.code ?? 0
    if (code !== 0) {
        const error = new Error(
            body.message?.trim() ||
                body.msg?.trim() ||
                `哔哩哔哩请求失败 ${code}`,
        )
        ;(error as Error & { code?: number }).code = code
        throw error
    }
    if (body.data === undefined) {
        throw new Error("哔哩哔哩返回了空数据")
    }
    return body.data
}

async function bilibiliRequest<T>(
    input: BilibiliRequestInput,
): Promise<T> {
    const base = input.params ?? {}
    const signed =
        input.wbi === false || getApiSettings().mode === "external"
            ? base
            : await signWbi(base)
    try {
        return await requestOnce<T>(input, signed)
    } catch (error) {
        const code =
            error && typeof error === "object" && "code" in error
                ? (error as { code?: number }).code
                : undefined
        if (code == null || !RISK_CODES.has(code) || input.wbi === false) {
            throw error
        }
        clearWbiCache()
        const retryParams =
            getApiSettings().mode === "external"
                ? base
                : await signWbi(base)
        return requestOnce<T>(input, retryParams)
    }
}

async function bilibiliPassportRequest<T>(
 path: string,
 params?: WbiParams,
): Promise<T & { cookie?: string }> {
 const query = params
 ? Object.keys(params)
 .map((key) => {
 const value = params[key]
 return value === undefined
 ? ""
 : `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
 })
 .filter(Boolean)
 .join("&")
 : ""
 const url = `https://passport.bilibili.com${path}${query ? `?${query}` : ""}`
 const body = (await bilibiliProxyGet(url)) as BilibiliPassportEnvelope<T>
 if (body.code != null && body.code !==0) {
 throw new Error(body.message?.trim() || `B站登录请求失败 ${body.code}`)
 }
 return {
 ...(body.data ?? body),
 cookie: body.cookie,
 } as T & { cookie?: string }
}

export { bilibiliPassportRequest, bilibiliRequest }
