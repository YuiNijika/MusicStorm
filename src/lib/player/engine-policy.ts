import { audioProbe, isTauriRuntime } from "@/lib/player/native-bridge"

const ENGINE_PREF_KEY = "musicstorm-player-engine"

type EnginePref = "auto" | "native" | "html5"
type EngineStatus = "native" | "html5" | "degraded"

const ENGINE_PREF_OPTIONS = [
    { id: "auto" as const, label: "自动（本地高音质原生输出）" },
    { id: "native" as const, label: "本地优先原生输出" },
    { id: "html5" as const, label: "强制 H5" },
]

function isEnginePref(value: string): value is EnginePref {
    return value === "auto" || value === "native" || value === "html5"
}

function getEnginePref(): EnginePref {
    if (typeof window === "undefined") {
        return "auto"
    }
    const raw = window.localStorage.getItem(ENGINE_PREF_KEY)
    if (raw === "wasapi") {
        window.localStorage.setItem(ENGINE_PREF_KEY, "native")
        return "native"
    }
    return raw && isEnginePref(raw) ? raw : "auto"
}

function setEnginePref(pref: EnginePref): void {
    window.localStorage.setItem(ENGINE_PREF_KEY, pref)
    window.dispatchEvent(new CustomEvent("musicstorm:engine-pref"))
}

function labelForNativeBackend(backend?: string | null): string {
    if (backend === "coreaudio") return "CoreAudio"
    if (backend === "wasapi") return "WASAPI"
    return "原生音频"
}

function labelForEngineStatus(status: EngineStatus, backend?: string | null): string {
    if (status === "native") {
        return labelForNativeBackend(backend)
    }
    if (status === "degraded") {
        return "H5（已降级）"
    }
    return "HTML5"
}

// 仅判断原生 probe 是否可用；具体曲目是否切换原生引擎由播放策略决定。
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

    if (pref === "native") {
        return {
            nativeReady: false,
            status: "degraded",
            message: probe.message ?? "原生音频不可用，已降级 H5",
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
    labelForNativeBackend,
    resolveEngineChoice,
    setEnginePref,
}
export type { EnginePref, EngineStatus }
