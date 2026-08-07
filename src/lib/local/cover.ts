import { convertFileSrc, invoke } from "@tauri-apps/api/core"

type CachedCover = {
    originalPath: string
    thumbnailPath: string
}

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function coverPathToUrl(path: string | null | undefined): string {
    if (!path) {
        return ""
    }
    if (/^(?:data:|https?:|asset:|blob:)/i.test(path)) {
        return path
    }
    try {
        const normalized = path.replace(/^file:\/\//i, "").replace(/^\/([A-Za-z]:)/, "$1")
        return convertFileSrc(normalized)
    } catch {
        return ""
    }
}

/** 桌面端直接缓存原图和缩略图；浏览器预览仅返回临时 data URL。 */
async function pickCoverImage(): Promise<CachedCover | null> {
    if (isTauriRuntime()) {
        return invoke<CachedCover | null>("pick_cover_image")
    }
    const dataUrl = await pickImageViaFileInput()
    return dataUrl ? { originalPath: dataUrl, thumbnailPath: dataUrl } : null
}

async function cacheCoverUrl(url: string): Promise<CachedCover> {
    const trimmed = url.trim()
    if (!trimmed) {
        throw new Error("封面地址为空")
    }
    if (isTauriRuntime()) {
        return invoke<CachedCover>("cache_cover_url", { url: trimmed })
    }
    const response = await fetch(trimmed)
    if (!response.ok) {
        throw new Error(`封面下载失败 (${response.status})`)
    }
    const dataUrl = await blobToDataUrl(await response.blob())
    return { originalPath: dataUrl, thumbnailPath: dataUrl }
}

/**
 * 兼容旧调用 返回 data URL 字符串，供专辑抽屉等仅需要可展示封面的场景使用。
 * 桌面端会先缓存到文件再转 asset URL，避免 base64 进 localStorage。
 */
async function pickImageAsDataUrl(): Promise<string | null> {
    const cached = await pickCoverImage()
    if (!cached) {
        return null
    }
    return coverPathToUrl(cached.originalPath) || cached.originalPath
}

/** 兼容旧调用：下载远程封面并返回可展示 URL。 */
async function fetchImageAsDataUrl(url: string): Promise<string> {
    const cached = await cacheCoverUrl(url)
    return coverPathToUrl(cached.originalPath) || cached.originalPath
}

/** 将旧版 Base64 封面迁移到文件缓存。 */
async function migrateLegacyCover(dataUrl: string): Promise<CachedCover> {
    if (!dataUrl.startsWith("data:")) {
        return { originalPath: dataUrl, thumbnailPath: dataUrl }
    }
    if (!isTauriRuntime()) {
        return { originalPath: dataUrl, thumbnailPath: dataUrl }
    }
    return invoke<CachedCover>("cache_cover_data_url", { dataUrl })
}

function pickImageViaFileInput(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/png,image/jpeg,image/webp"
        input.onchange = () => {
            const file = input.files?.[0]
            if (!file) {
                resolve(null)
                return
            }
            const reader = new FileReader()
            reader.onload = () =>
                resolve(typeof reader.result === "string" ? reader.result : null)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(file)
        }
        input.click()
    })
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result)
                return
            }
            reject(new Error("无法读取图片"))
        }
        reader.onerror = () => reject(new Error("无法读取图片"))
        reader.readAsDataURL(blob)
    })
}

/** 从封面 URL / 路径提取缓存内容 MD5；非缓存路径返回 null */
function extractCoverHash(url: string): string | null {
    const match = /[\\/]originals[\\/]([a-f0-9]{16,})\.[a-z0-9]+$/i.exec(url)
    return match?.[1] ?? null
}

export {
    cacheCoverUrl,
    coverPathToUrl,
    extractCoverHash,
    fetchImageAsDataUrl,
    isTauriRuntime,
    migrateLegacyCover,
    pickCoverImage,
    pickImageAsDataUrl,
}
export type { CachedCover }