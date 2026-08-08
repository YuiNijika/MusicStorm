import { audioProbe, isTauriRuntime } from "@/lib/player/native-bridge"

const ENGINE_PREF_KEY = "musicstorm-player-engine"

type EnginePref = "auto" | "wasapi" | "html5"
type EngineStatus = "wasapi" | "html5" | "degraded"

const ENGINE_PREF_OPTIONS = [
    { id: "auto" as const, label: "自动（本地高音质 WASAPI）" },
    { id: "wasapi" as const, label: "本地优先 WASAPI" },
    { id: "html5" as const, label: "强制 H5" },
]

function isEnginePref(value: string): value is EnginePref {
    return value === "auto" || value === "wasapi" || value === "html5"
}

function getEnginePref(): EnginePref {
    if (typeof window === "undefined") {
        return "auto"
    }
    const raw = window.localStorage.getItem(ENGINE_PREF_KEY)
    return raw && isEnginePref(raw) ? raw : "auto"
}

function setEnginePref(pref: EnginePref): void {
    window.localStorage.setItem(ENGINE_PREF_KEY, pref)
    window.dispatchEvent(new CustomEvent("musicstorm:engine-pref"))
}

function labelForEngineStatus(status: EngineStatus): string {
    if (status === "wasapi") {
        return "WASAPI"
    }
    if (status === "degraded") {
        return "H5（已降级）"
    }
    return "HTML5"
}

// 仅判断原生 probe 是否可用；不再「一上来全局 wasapi」
async function resolveEngineChoice(
    pref: EnginePref = getEnginePref(),
): Promise<{ nativeReady: boolean; status: EngineStatus; message?: string }> {
    if (pref === "html5" || !isTauriRuntime()) {
        return { nativeReady: false, status: "html5" }
    }

    const probe = await audioProbe()
    if (probe.available) {
        return { nativeReady: true, status: "html5" }
    }

    if (pref === "wasapi") {
        return {
            nativeReady: false,
            status: "degraded",
            message: probe.message ?? "WASAPI 不可用，已降级 H5",
        }
    }

    // auto 且 probe 失败：仍可用 H5，不必标 degraded 吓人
    return {
        nativeReady: false,
        status: "html5",
        message: probe.message ?? "原生不可用，使用 H5",
    }
}

export {
    ENGINE_PREF_KEY,
    ENGINE_PREF_OPTIONS,
    getEnginePref,
    labelForEngineStatus,
    resolveEngineChoice,
    setEnginePref,
}
export type { EnginePref, EngineStatus }