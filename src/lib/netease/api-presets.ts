/** 网易云 API 源预设 + 测速 */

import { getNeteaseBaseUrl, setNeteaseBaseUrl } from "@/lib/netease/client"

const PRESET_KEY = "musicstorm-netease-base-preset"
const SPEED_TIMEOUT_MS = 5_000

const NETEASE_API_PRESETS = [
    {
        id: "official",
        label: "MusicStorm 官方源",
        baseURL: "https://cloud-music-api.miomoe.cn",
    },
    {
        id: "qijieya",
        label: "公共服务",
        baseURL: "https://musicapi.qijieya.cn",
    },
    {
        id: "custom",
        label: "自定义",
        baseURL: "",
    },
] as const

type ApiPresetId = (typeof NETEASE_API_PRESETS)[number]["id"]

type SpeedTestResult =
    | { ok: true; ms: number }
    | { ok: false; message: string }

function isApiPresetId(value: string): value is ApiPresetId {
    return NETEASE_API_PRESETS.some((item) => item.id === value)
}

function getApiPresetId(): ApiPresetId {
    if (typeof window === "undefined") {
        return "official"
    }
    const raw = window.localStorage.getItem(PRESET_KEY)
    if (raw && isApiPresetId(raw)) {
        return raw
    }
    // 兼容旧数据：按 URL 反推
    const current = getNeteaseBaseUrl()
    const matched = NETEASE_API_PRESETS.find(
        (item) => item.id !== "custom" && item.baseURL === current,
    )
    return matched?.id ?? "custom"
}

function setApiPresetId(id: ApiPresetId): void {
    window.localStorage.setItem(PRESET_KEY, id)
}

function applyApiPreset(id: ApiPresetId, customUrl?: string): string {
    setApiPresetId(id)
    if (id === "custom") {
        const next = (customUrl ?? getNeteaseBaseUrl()).replace(/\/$/, "") || getNeteaseBaseUrl()
        setNeteaseBaseUrl(next)
        return next
    }
    const preset = NETEASE_API_PRESETS.find((item) => item.id === id)
    const base = preset?.baseURL ?? NETEASE_API_PRESETS[0].baseURL
    setNeteaseBaseUrl(base)
    return base
}

/** 轻量测速：优先 /search，失败再试根路径 */
async function speedTestApi(baseURL: string): Promise<SpeedTestResult> {
    const base = baseURL.replace(/\/$/, "")
    const candidates = [
        `${base}/search?keywords=a&limit=1`,
        `${base}/`,
    ]

    for (const target of candidates) {
        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), SPEED_TIMEOUT_MS)
        const started = performance.now()
        try {
            const response = await fetch(target, {
                method: "GET",
                signal: controller.signal,
                credentials: "omit",
            })
            const ms = Math.round(performance.now() - started)
            window.clearTimeout(timer)
            if (!response.ok && response.status >= 500) {
                continue
            }
            return { ok: true, ms }
        } catch (error) {
            window.clearTimeout(timer)
            if (error instanceof DOMException && error.name === "AbortError") {
                return { ok: false, message: "超时" }
            }
            // 尝试下一候选
        }
    }

    return { ok: false, message: "无法连接" }
}

export {
    NETEASE_API_PRESETS,
    PRESET_KEY,
    applyApiPreset,
    getApiPresetId,
    setApiPresetId,
    speedTestApi,
}
export type { ApiPresetId, SpeedTestResult }