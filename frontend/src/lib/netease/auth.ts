import { setCookiesFromApi } from "@/lib/netease/auth-cookie"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { qrTextToDataUrl } from "@/lib/qr-data-url"

type QrKeyData = {
    code?: number
    data?: { unikey?: string }
}

type QrCreateData = {
    code?: number
    data?: {
        qrurl?: string
        qrimg?: string
    }
}

/** 800 过期 · 801 待扫 · 802 已扫待确认 · 803 成功 */
type QrCheckData = {
    code?: number
    message?: string
    cookie?: string
    data?: { cookie?: string }
}

type QrSession = {
    key: string
    qrimg: string
    qrurl: string
}

async function fetchQrKey(): Promise<string> {
    const data = await neteaseRequest<QrKeyData>({
        path: NETEASE_PATHS.loginQrKey,
        params: { timestamp: Date.now() },
    })
    const key = data.data?.unikey
    if (!key) {
        throw new Error("无法获取登录二维码")
    }
    return key
}

// 内置 create 只给 qrurl；对接源可能直接给 qrimg base64
function resolveQrImage(qrimg: string, qrurl: string): string {
    const img = qrimg.trim()
    if (img) {
        return img
    }
    const url = qrurl.trim()
    if (!url) {
        return ""
    }
    return qrTextToDataUrl(url)
}

async function createQrSession(): Promise<QrSession> {
    const key = await fetchQrKey()
    const data = await neteaseRequest<QrCreateData>({
        path: NETEASE_PATHS.loginQrCreate,
        params: {
            key,
            qrimg: true,
            timestamp: Date.now(),
        },
    })
    const qrurl = data.data?.qrurl ?? ""
    const qrimg = resolveQrImage(data.data?.qrimg ?? "", qrurl)
    if (!qrimg) {
        throw new Error("无法生成登录二维码")
    }
    return { key, qrimg, qrurl }
}

async function checkQrLogin(key: string): Promise<QrCheckData> {
    return neteaseRequest<QrCheckData>({
        path: NETEASE_PATHS.loginQrCheck,
        params: {
            key,
            timestamp: Date.now(),
        },
    })
}

// 803 时写入 cookie；第三方源 cookie 可能包在 data 里，两层都取
async function pollQrLogin(key: string): Promise<number> {
    const data = await checkQrLogin(key)
    const code = data.code ?? 0
    const cookie = data.cookie ?? data.data?.cookie
    if (code === 803 && cookie) {
        setCookiesFromApi(cookie)
    }
    return code
}

export { checkQrLogin, createQrSession, fetchQrKey, pollQrLogin }
export type { QrSession }