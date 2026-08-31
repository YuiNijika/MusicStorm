// 单一 localStorage 真相源

import { isWebMode } from "@/lib/web-mode"

const SETTINGS_KEY = "musicstorm-api-settings"
const LEGACY_BASE_URL_KEY = "musicstorm-netease-base-url"
const LEGACY_PRESET_KEY = "musicstorm-netease-base-preset"

// 自定义空值与集成降级回落
const DEFAULT_BASE_URL = "https://api.miomoe.cn/netease/music"

const EXTERNAL_SOURCES = [
    {
        id: "official" as const,
        label: "MusicStorm 官方源",
        baseURL: DEFAULT_BASE_URL,
    },
    {
        id: "custom" as const,
        label: "自定义",
        baseURL: "",
    },
]

type ApiMode = "integrated" | "external"
type ExternalSourceId = (typeof EXTERNAL_SOURCES)[number]["id"]

type ApiSettings = {
    mode: ApiMode
    source: ExternalSourceId
    customUrl: string
    /**
     * 历史字段：原 sidecar 本机地址。
     * 内置模式现为 TS 直连，不再使用；保留仅为兼容旧 localStorage。
     */
    integratedBaseUrl: string
}

const API_SETTINGS_EVENT = "musicstorm-api-settings-change"

const DEFAULT_SETTINGS: ApiSettings = {
    mode: "integrated",
    source: "official",
    customUrl: "",
    integratedBaseUrl: "",
}

function normalizeUrl(url: string): string {
    return url.trim().replace(/\/$/, "")
}

function isExternalSourceId(value: string): value is ExternalSourceId {
    return EXTERNAL_SOURCES.some((item) => item.id === value)
}

function isApiMode(value: string): value is ApiMode {
    return value === "integrated" || value === "external"
}

function migrateLegacy(): ApiSettings | null {
    if (typeof window === "undefined") {
        return null
    }
    const legacyUrl = window.localStorage.getItem(LEGACY_BASE_URL_KEY)
    const legacyPreset = window.localStorage.getItem(LEGACY_PRESET_KEY)
    if (!legacyUrl && !legacyPreset) {
        return null
    }

    let source: ExternalSourceId = "custom"
    if (legacyPreset && isExternalSourceId(legacyPreset)) {
        source = legacyPreset
    } else if (legacyUrl) {
        const matched = EXTERNAL_SOURCES.find(
            (item) => item.id !== "custom" && item.baseURL === normalizeUrl(legacyUrl),
        )
        source = matched?.id ?? "custom"
    }

    const customUrl =
        source === "custom" ? normalizeUrl(legacyUrl || "") : ""

    // 旧用户有过显式 URL/预设 → 对接模式；否则保持默认集成
    const mode: ApiMode =
        legacyUrl || legacyPreset ? "external" : "integrated"

    return {
        ...DEFAULT_SETTINGS,
        mode,
        source,
        customUrl,
        integratedBaseUrl: "",
    }
}

function readRaw(): ApiSettings {
    if (typeof window === "undefined") {
        return { ...DEFAULT_SETTINGS }
    }

    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        if (raw) {
            const data = JSON.parse(raw) as Partial<ApiSettings>
            return {
                // 网页版无本机加密链路：mode 锁定 external，外部源与自定义 URL 可切换
                mode: isWebMode()
                    ? "external"
                    : isApiMode(String(data.mode ?? ""))
                      ? (data.mode as ApiMode)
                      : DEFAULT_SETTINGS.mode,
                source: isExternalSourceId(String(data.source ?? ""))
                    ? (data.source as ExternalSourceId)
                    : DEFAULT_SETTINGS.source,
                customUrl:
                    typeof data.customUrl === "string" ? data.customUrl : "",
                integratedBaseUrl:
                    typeof data.integratedBaseUrl === "string"
                        ? data.integratedBaseUrl
                        : "",
            }
        }
    } catch {
        // 旧格式解析失败时继续走迁移，不清空用户数据
    }

    const migrated = migrateLegacy()
    if (migrated) {
        if (isWebMode()) {
            migrated.mode = "external"
        }
        writeSettings(migrated, false)
        window.localStorage.removeItem(LEGACY_BASE_URL_KEY)
        window.localStorage.removeItem(LEGACY_PRESET_KEY)
        return migrated
    }

    return { ...DEFAULT_SETTINGS, mode: isWebMode() ? "external" : DEFAULT_SETTINGS.mode }
}

function writeSettings(next: ApiSettings, emit = true): void {
    if (typeof window === "undefined") {
        return
    }
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    if (emit) {
        window.dispatchEvent(new CustomEvent(API_SETTINGS_EVENT))
    }
}

function getApiSettings(): ApiSettings {
    return readRaw()
}

function setApiSettings(patch: Partial<ApiSettings>): ApiSettings {
    const prev = readRaw()
    const next: ApiSettings = {
        // 网页版无本机加密链路，mode 不可切
        mode: isWebMode()
            ? "external"
            : patch.mode && isApiMode(patch.mode)
              ? patch.mode
              : prev.mode,
        source:
            patch.source && isExternalSourceId(patch.source)
                ? patch.source
                : prev.source,
        customUrl:
            patch.customUrl !== undefined
                ? normalizeUrl(patch.customUrl)
                : prev.customUrl,
        // 历史 sidecar 字段：不再读写业务语义，落盘恒空
        integratedBaseUrl: "",
    }
    writeSettings(next)
    return next
}

function setApiMode(mode: ApiMode): ApiSettings {
    return setApiSettings({ mode })
}

function setExternalSource(source: ExternalSourceId, customUrl?: string): ApiSettings {
    return setApiSettings({
        mode: "external",
        source,
        ...(customUrl !== undefined ? { customUrl } : {}),
    })
}

/**
 * @deprecated 内置模式为 TS 直连，不再使用本机 baseURL；保留 no-op 兼容旧调用。
 */
function setIntegratedBaseUrl(_url: string): ApiSettings {
    return setApiSettings({})
}

// 内置模式返回 native 标记作缓存键，非真实 HTTP
function resolveEffectiveBaseUrl(settings: ApiSettings = readRaw()): string {
    if (settings.mode === "integrated") {
        return "native://musicstorm"
    }

    if (settings.source === "custom") {
        return normalizeUrl(settings.customUrl) || DEFAULT_BASE_URL
    }

    const preset = EXTERNAL_SOURCES.find((item) => item.id === settings.source)
    return preset?.baseURL || DEFAULT_BASE_URL
}

function getNeteaseBaseUrl(): string {
    return resolveEffectiveBaseUrl()
}

/** @deprecated 请用 setApiSettings / setExternalSource；保留兼容调用点 */
function setNeteaseBaseUrl(url: string): void {
    setApiSettings({
        mode: "external",
        source: "custom",
        customUrl: url,
    })
}

const SPEED_TIMEOUT_MS = 5_000

type SpeedTestResult =
    | { ok: true; ms: number }
    | { ok: false; message: string }

// 各源的首选探测接口：官方源（miomoe 系 NeteaseCloudMusicApi）根路径没有路由会 404，
// 用 login/status（只校验 cookie、不走重上游）这类轻接口测；其他源维持通用探测
const SPEED_PROBES: Record<"official" | "custom", string[]> = {
    official: ["/login/status", "/search?keywords=a&limit=1", "/"],
    custom: ["/search?keywords=a&limit=1", "/"],
}

async function fetchWithTimeout(
    target: string,
): Promise<{ response: Response | null; ms: number; aborted: boolean }> {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), SPEED_TIMEOUT_MS)
    const started = performance.now()
    try {
        const response = await fetch(target, {
            method: "GET",
            signal: controller.signal,
            credentials: "omit",
        })
        return {
            response,
            ms: Math.round(performance.now() - started),
            aborted: false,
        }
    } catch (error) {
        return {
            response: null,
            ms: Math.round(performance.now() - started),
            aborted:
                error instanceof DOMException && error.name === "AbortError",
        }
    } finally {
        window.clearTimeout(timer)
    }
}

async function speedTestApi(baseURL: string): Promise<SpeedTestResult> {
    const base = normalizeUrl(baseURL)
    const settings = getApiSettings()
    // 官方源用专属轻接口优先；自定义源可能任意实现，保持通用探测
    const candidates =
        settings.source === "official"
            ? SPEED_PROBES.official
            : SPEED_PROBES.custom

    // 第一轮：找一个返回 200 的真实接口，延迟才有意义
    let reachable = false
    for (const path of candidates) {
        const { response, ms, aborted } = await fetchWithTimeout(
            `${base}${path}`,
        )
        if (aborted) {
            return { ok: false, message: "超时" }
        }
        if (response && response.ok) {
            return { ok: true, ms }
        }
        if (response) {
            // 4xx（如根路径 404）也算服务器可达，留作兜底
            reachable = true
        }
    }

    // 第二轮兜底：所有真实接口都不可用（如服务器上游故障），但 HTTP 有响应
    // 说明服务本身在线，仍然给出可达结果，避免把「上游挂了」误报成「连不上」
    if (reachable) {
        const { response, ms } = await fetchWithTimeout(`${base}/`)
        if (response) {
            return { ok: true, ms }
        }
    }

    return { ok: false, message: "无法连接" }
}

// 兼容旧 api-presets 命名
const NETEASE_API_PRESETS = EXTERNAL_SOURCES
type ApiPresetId = ExternalSourceId

function getApiPresetId(): ApiPresetId {
    return getApiSettings().source
}

function applyApiPreset(id: ApiPresetId, customUrl?: string): string {
    const next = setExternalSource(id, customUrl)
    return resolveEffectiveBaseUrl(next)
}

export {
    API_SETTINGS_EVENT,
    DEFAULT_BASE_URL,
    DEFAULT_SETTINGS,
    EXTERNAL_SOURCES,
    NETEASE_API_PRESETS,
    applyApiPreset,
    getApiPresetId,
    getApiSettings,
    getNeteaseBaseUrl,
    resolveEffectiveBaseUrl,
    setApiMode,
    setApiSettings,
    setExternalSource,
    setIntegratedBaseUrl,
    setNeteaseBaseUrl,
    speedTestApi,
}
export type {
    ApiMode,
    ApiPresetId,
    ApiSettings,
    ExternalSourceId,
    SpeedTestResult,
}