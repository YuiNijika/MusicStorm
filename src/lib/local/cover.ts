import { convertFileSrc, invoke } from "@tauri-apps/api/core"

import { isAndroid } from "@/lib/platform"

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

// Android 无桌面选图命令，退回 WebView 文件选择器（浏览器预览同理）
async function pickCoverImage(): Promise<CachedCover | null> {
    if (isTauriRuntime() && !isAndroid()) {
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

// 兼容旧调用：桌面端先缓存到文件再转 asset URL，避免 base64 进 localStorage
async function pickImageAsDataUrl(): Promise<string | null> {
    const cached = await pickCoverImage()
    if (!cached) {
        return null
    }
    return coverPathToUrl(cached.originalPath) || cached.originalPath
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
    const cached = await cacheCoverUrl(url)
    return coverPathToUrl(cached.originalPath) || cached.originalPath
}

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