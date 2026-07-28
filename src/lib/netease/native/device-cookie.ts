/**
 * 设备 / 访客 cookie 对齐 CloudMusicAPI processCookieObject
 *
 * 扫码风控关键：MUSIC_A 必须与签发它的 deviceId 全程一致；
 * 外置 API 在 register_anonimous 后用 global.deviceId 贯穿所有请求。
 */

import CryptoJS from "crypto-js"

/** CloudMusicAPI osMap.pc.appver — 与 eapi 登录链路一致 */
const PC_APPVER = "3.1.17.204416"
/** UA 里桌面版号（userAgentMap.api.pc） */
const DESKTOP_UA_APPVER = "3.1.29.205117"

const DEVICE_ID_KEY = "netease-device-id"
const NMTID_KEY = "netease-nmtid"
const WNMCID_KEY = "netease-wnmcid"
const NTES_NUID_KEY = "netease-ntes-nuid"
const MUSIC_A_KEY = "cookie-MUSIC_A"

const ID_XOR_KEY = "3go8&$8*3*3h0k(2)2"

function readLocal(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeLocal(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // ignore
    }
}

function removeLocal(key: string): void {
    try {
        window.localStorage.removeItem(key)
    } catch {
        // ignore
    }
}

function randomHex(len: number, upper = false): string {
    const chars = upper ? "0123456789ABCDEF" : "0123456789abcdef"
    let out = ""
    for (let i = 0; i < len; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)]
    }
    return out
}

/** 对齐 CloudMusicAPI generateDeviceId：52 位大写 hex */
function generateDeviceId(): string {
    return randomHex(52, true)
}

function isCanonicalDeviceId(value: string | null | undefined): boolean {
    return Boolean(value && /^[0-9A-Fa-f]{52}$/.test(value))
}

function getOrCreate(key: string, factory: () => string): string {
    const existing = readLocal(key)
    if (existing) {
        return existing
    }
    const next = factory()
    writeLocal(key, next)
    return next
}

/**
 * 全局唯一 deviceId（游客注册 + 全部 eapi/weapi 共用）。
 * 旧版 20 位字母数字会与 MUSIC_A 错位触发「登录有风险」，强制迁移。
 */
function getOrCreateDeviceId(): string {
    const existing = readLocal(DEVICE_ID_KEY)
    if (isCanonicalDeviceId(existing)) {
        return existing as string
    }
    // 指纹形态变了：清游客 token，强制重新匿名注册
    if (existing) {
        removeLocal(MUSIC_A_KEY)
        removeLocal("netease-anon-device-id")
    }
    const next = generateDeviceId()
    writeLocal(DEVICE_ID_KEY, next)
    return next
}

function getOrCreateNmtid(): string {
    return getOrCreate(NMTID_KEY, () => randomHex(32))
}

function getOrCreateWnmcid(): string {
    return getOrCreate(WNMCID_KEY, () => {
        const chars = "abcdefghijklmnopqrstuvwxyz"
        let s = ""
        for (let i = 0; i < 6; i += 1) {
            s += chars[Math.floor(Math.random() * chars.length)]
        }
        return `${s}.${Date.now()}.01.0`
    })
}

function getOrCreateNtesNuid(): string {
    return getOrCreate(NTES_NUID_KEY, () => randomHex(32))
}

function cloudmusicDllEncodeId(deviceId: string): string {
    let xored = ""
    for (let i = 0; i < deviceId.length; i += 1) {
        const code =
            deviceId.charCodeAt(i) ^
            ID_XOR_KEY.charCodeAt(i % ID_XOR_KEY.length)
        xored += String.fromCharCode(code)
    }
    const digest = CryptoJS.MD5(CryptoJS.enc.Utf8.parse(xored))
    return CryptoJS.enc.Base64.stringify(digest)
}

function buildAnonymousUsername(deviceId: string): string {
    const encoded = `${deviceId} ${cloudmusicDllEncodeId(deviceId)}`
    return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(encoded))
}

function getStoredMusicA(): string | null {
    return readLocal(MUSIC_A_KEY)
}

function storeMusicA(token: string): void {
    if (!token) {
        return
    }
    writeLocal(MUSIC_A_KEY, token)
}

function clearAnonymousSession(): void {
    removeLocal(MUSIC_A_KEY)
}

/**
 * 对齐 processCookieObject。
 * 登录路径不加 NMTID。
 */
function ensureDeviceCookies(
    jar: Record<string, string>,
    options?: { isLoginPath?: boolean },
): Record<string, string> {
    const next = { ...jar }
    const nuid = getOrCreateNtesNuid()
    const deviceId = getOrCreateDeviceId()

    if (!next.__remember_me) {
        next.__remember_me = "true"
    }
    if (!next.ntes_kaola_ad) {
        next.ntes_kaola_ad = "1"
    }
    if (!next._ntes_nuid) {
        next._ntes_nuid = nuid
    }
    if (!next._ntes_nnid) {
        next._ntes_nnid = `${nuid},${Date.now()}`
    }
    if (!next.WNMCID) {
        next.WNMCID = getOrCreateWnmcid()
    }
    if (!next.WEVNSM) {
        next.WEVNSM = "1.0.0"
    }
    // 强制与游客注册同一套 pc 指纹，避免 jar 里残留错误 appver/deviceId
    next.os = next.os || "pc"
    next.appver = next.appver || PC_APPVER
    next.osver =
        next.osver || "Microsoft-Windows-10-Professional-build-19045-64bit"
    next.channel = next.channel || "netease"
    next.deviceId = isCanonicalDeviceId(next.deviceId)
        ? (next.deviceId as string)
        : deviceId

    if (!options?.isLoginPath && !next.NMTID) {
        next.NMTID = getOrCreateNmtid()
    }
    if (options?.isLoginPath) {
        delete next.NMTID
    }

    if (!next.MUSIC_U) {
        const musicA = next.MUSIC_A || getStoredMusicA()
        if (musicA) {
            next.MUSIC_A = musicA
        }
    }
    return next
}

function cookieToRecord(cookie: string | null | undefined): Record<string, string> {
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

function cookieHeader(jar: Record<string, string>): string {
    return Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ")
}

/** eapi createHeaderCookie */
function eapiHeaderCookie(header: Record<string, string>): string {
    return Object.entries(header)
        .map(
            ([k, v]) =>
                `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`,
        )
        .join("; ")
}

export {
    buildAnonymousUsername,
    clearAnonymousSession,
    cookieHeader,
    cookieToRecord,
    DESKTOP_UA_APPVER,
    eapiHeaderCookie,
    ensureDeviceCookies,
    getOrCreateDeviceId,
    getStoredMusicA,
    PC_APPVER,
    storeMusicA,
}