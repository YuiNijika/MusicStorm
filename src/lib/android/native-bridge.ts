// 桥缺失时调用一律失败/空结果，避免非 Android 误走桌面命令报错
import { isAndroid } from "@/lib/platform"

export type SafPickPayload = {
    ok: boolean
    cancelled?: boolean
    kind?: "folder" | "files"
    path?: string
    paths?: string[]
}

export type SafProgressPayload = {
    done: number
    total: number
}

type NativeBridge = {
    pickFolder?: () => void
    pickFiles?: () => void
    download?: (url: string, name: string) => void
}

function bridge(): NativeBridge {
    if (typeof window === "undefined") {
        return {}
    }
    return (
        (window as unknown as { musicStormNative?: NativeBridge }).musicStormNative ??
        {}
    )
}

function hasNativeBridge(): boolean {
    return isAndroid() && typeof bridge().pickFolder === "function"
}

function pickSafFolder(): Promise<string | null> {
    return new Promise((resolve) => {
        if (!hasNativeBridge()) {
            resolve(null)
            return
        }
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<SafPickPayload>).detail
            if (!detail) {
                return
            }
            window.removeEventListener("musicstorm:saf-picked", handler)
            if (detail.ok && detail.kind === "folder" && detail.path) {
                resolve(detail.path)
            } else {
                resolve(null)
            }
        }
        window.addEventListener("musicstorm:saf-picked", handler)
        bridge().pickFolder?.()
    })
}

function pickSafFiles(): Promise<string[]> {
    return new Promise((resolve) => {
        if (!hasNativeBridge()) {
            resolve([])
            return
        }
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<SafPickPayload>).detail
            if (!detail) {
                return
            }
            window.removeEventListener("musicstorm:saf-picked", handler)
            if (detail.ok && detail.kind === "files" && detail.paths) {
                resolve(detail.paths)
            } else {
                resolve([])
            }
        }
        window.addEventListener("musicstorm:saf-picked", handler)
        bridge().pickFiles?.()
    })
}

function downloadViaBridge(url: string, name: string): boolean {
    if (!isAndroid() || typeof bridge().download !== "function") {
        return false
    }
    bridge().download?.(url, name)
    return true
}

export {
    downloadViaBridge,
    hasNativeBridge,
    pickSafFiles,
    pickSafFolder,
}
export type { NativeBridge }