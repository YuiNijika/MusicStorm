/**
 * @deprecated 请直接使用 `@/lib/netease/api-settings`
 * 保留 re-export，避免旧 import 断裂。
 */
export {
    API_SETTINGS_EVENT,
    DEFAULT_BASE_URL,
    EXTERNAL_SOURCES as NETEASE_API_PRESETS,
    applyApiPreset,
    getApiPresetId,
    getApiSettings,
    getNeteaseBaseUrl,
    setApiMode,
    setApiSettings,
    setExternalSource,
    setIntegratedBaseUrl,
    setNeteaseBaseUrl,
    speedTestApi,
} from "@/lib/netease/api-settings"
export type {
    ApiMode,
    ApiPresetId,
    ApiSettings,
    ExternalSourceId,
    SpeedTestResult,
} from "@/lib/netease/api-settings"