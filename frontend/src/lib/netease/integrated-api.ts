
import { getApiSettings } from "@/lib/netease/api-settings"
import { isTauriRuntime, nativeNeteaseRequest } from "@/lib/netease/native/request"
import { NETEASE_PATHS } from "@/lib/netease/paths"

export type IntegratedApiStatus = {
    ready: boolean
    kind: "native" | "unavailable"
    message: string
}

async function probeNativeApi(): Promise<IntegratedApiStatus> {
    if (!isTauriRuntime()) {
        return {
            ready: false,
            kind: "unavailable",
            message: "浏览器预览无法使用内置 API，请切换「对接 API」或使用桌面应用",
        }
    }
    try {
        // 轻量请求：搜索 1 条
        await nativeNeteaseRequest(NETEASE_PATHS.search, {
            keywords: "a",
            limit: 1,
            type: 1,
        })
        return {
            ready: true,
            kind: "native",
            message: "内置 API 就绪",
        }
    } catch (error) {
        return {
            ready: false,
            kind: "native",
            message:
                error instanceof Error
                    ? error.message
                    : "内置 API 探测失败",
        }
    }
}

async function ensureIntegratedApiIfNeeded(): Promise<IntegratedApiStatus | null> {
    if (getApiSettings().mode !== "integrated") {
        return null
    }
    return probeNativeApi()
}

export {
    ensureIntegratedApiIfNeeded,
    isTauriRuntime,
    probeNativeApi,
}