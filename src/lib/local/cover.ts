import { invoke } from "@tauri-apps/api/core"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/** 本地文件 → data URL（桌面 invoke；浏览器用 file input） */
async function pickImageAsDataUrl(): Promise<string | null> {
    if (isTauriRuntime()) {
        return invoke<string | null>("pick_image_as_base64")
    }
    return pickImageViaFileInput()
}

function pickImageViaFileInput(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/png,image/jpeg,image/webp,image/gif"
        input.onchange = () => {
            const file = input.files?.[0]
            if (!file) {
                resolve(null)
                return
            }
            const reader = new FileReader()
            reader.onload = () => {
                const result = typeof reader.result === "string" ? reader.result : null
                resolve(result)
            }
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(file)
        }
        input.click()
    })
}

/** 远程封面 URL → data URL（写入本地库） */
async function fetchImageAsDataUrl(url: string): Promise<string> {
    const trimmed = url.trim()
    if (!trimmed) {
        throw new Error("封面地址为空")
    }
    if (trimmed.startsWith("data:")) {
        return trimmed
    }

    const response = await fetch(trimmed)
    if (!response.ok) {
        throw new Error(`封面下载失败 (${response.status})`)
    }
    const blob = await response.blob()
    return blobToDataUrl(blob)
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

export { fetchImageAsDataUrl, isTauriRuntime, pickImageAsDataUrl }