import CryptoJS from "crypto-js"

import { bilibiliProxyGet } from "@/lib/bilibili/proxy"

type WbiKeys = {
    imgKey: string
    subKey: string
}

type WbiCache = WbiKeys & {
    cachedAt: number
}

type WbiParams = Record<string, string | number | boolean>

type NavResponse = {
    code?: number
    data?: {
        wbi_img?: {
            img_url?: string
            sub_url?: string
        }
    }
}

const STORAGE_KEY = "musicstorm-bilibili-wbi"
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const MIXIN_KEY_TABLE = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
] as const

let memoryCache: WbiCache | null = null
let pendingKeys: Promise<WbiKeys> | null = null

function fileStem(url: string): string {
    const path = (() => {
        try {
            return new URL(url).pathname
        } catch {
            return url
        }
    })()
    const name = path.slice(path.lastIndexOf("/") + 1)
    const dot = name.lastIndexOf(".")
    return dot <= 0 ? name : name.slice(0, dot)
}

function readStoredCache(): WbiCache | null {
    if (typeof window === "undefined") {
        return null
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return null
        }
        const parsed = JSON.parse(raw) as Partial<WbiCache>
        if (
            typeof parsed.imgKey === "string" &&
            typeof parsed.subKey === "string" &&
            typeof parsed.cachedAt === "number"
        ) {
            return {
                imgKey: parsed.imgKey,
                subKey: parsed.subKey,
                cachedAt: parsed.cachedAt,
            }
        }
    } catch {
        // Fall through to a fresh request
    }
    return null
}

function storeCache(cache: WbiCache): void {
    memoryCache = cache
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch {
        // The in memory cache is enough for this session
    }
}

async function fetchWbiKeys(): Promise<WbiKeys> {
    const body = (await bilibiliProxyGet(
        "https://api.bilibili.com/x/web-interface/nav",
    )) as NavResponse
    const imgUrl = body.data?.wbi_img?.img_url
    const subUrl = body.data?.wbi_img?.sub_url
    if (!imgUrl || !subUrl) {
        throw new Error("哔哩哔哩风控校验初始化失败")
    }
    const keys = {
        imgKey: fileStem(imgUrl),
        subKey: fileStem(subUrl),
    }
    if (!keys.imgKey || !keys.subKey) {
        throw new Error("哔哩哔哩风控校验初始化失败")
    }
    storeCache({ ...keys, cachedAt: Date.now() })
    return keys
}

async function getWbiKeys(): Promise<WbiKeys> {
    const cached =
        memoryCache ??
        (() => {
            const stored = readStoredCache()
            memoryCache = stored
            return stored
        })()
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return { imgKey: cached.imgKey, subKey: cached.subKey }
    }
    if (pendingKeys) {
        return pendingKeys
    }
    const request = fetchWbiKeys()
    pendingKeys = request
    try {
        return await request
    } finally {
        if (pendingKeys === request) {
            pendingKeys = null
        }
    }
}

function mixinKey(source: string): string {
    return MIXIN_KEY_TABLE.map((index) => source[index] ?? "")
        .join("")
        .slice(0, 32)
}

function encodeWbiValue(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, "")
}

async function signWbi(params: WbiParams): Promise<WbiParams> {
    const keys = await getWbiKeys()
    const next: WbiParams = {
        ...params,
        wts: Math.floor(Date.now() / 1000),
    }
    const query = Object.keys(next)
        .sort()
        .map((key) => {
            const value = String(next[key]).replace(/[!'()*]/g, "")
            return `${encodeWbiValue(key)}=${encodeWbiValue(value)}`
        })
        .join("&")
    const key = mixinKey(`${keys.imgKey}${keys.subKey}`)
    const wRid = CryptoJS.MD5(`${query}${key}`).toString()
    return { ...next, w_rid: wRid }
}

function clearWbiCache(): void {
    memoryCache = null
    pendingKeys = null
    try {
        window.localStorage.removeItem(STORAGE_KEY)
    } catch {
        // Nothing else to clear
    }
}

export { clearWbiCache, encodeWbiValue, signWbi }
export type { WbiParams }
