import { invoke } from "@tauri-apps/api/core"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

type AudioDeviceInfo = {
    id: string
    name: string
    isDefault: boolean
}

type AudioOutputMode = {
    exclusive: boolean
    supportsExclusive: boolean
    deviceId: string
    lastError: string | null
    backend: string
    note: string
}

type AudioProbeResult = {
    available: boolean
    backend: string
    devices: AudioDeviceInfo[]
    message?: string
}

async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (!isTauriRuntime()) {
        return [{ id: "default", name: "系统默认输出", isDefault: true }]
    }
    return invoke<AudioDeviceInfo[]>("audio_list_devices")
}

async function getAudioOutputMode(): Promise<AudioOutputMode | null> {
    if (!isTauriRuntime()) {
        return null
    }
    return invoke<AudioOutputMode>("audio_get_output_mode")
}

async function setAudioDevice(deviceId: string): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    await invoke("audio_set_device", { deviceId })
}

async function setAudioExclusive(exclusive: boolean): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }
    await invoke("audio_set_exclusive", { exclusive })
}

async function audioProbe(): Promise<AudioProbeResult> {
    if (!isTauriRuntime()) {
        return {
            available: false,
            backend: "html5",
            devices: [],
            message: "浏览器环境仅 HTML5",
        }
    }
    try {
        return await invoke<AudioProbeResult>("audio_probe")
    } catch (error) {
        return {
            available: false,
            backend: "html5",
            devices: [],
            message: error instanceof Error ? error.message : "probe 失败",
        }
    }
}

export {
    audioProbe,
    getAudioOutputMode,
    isTauriRuntime,
    listAudioDevices,
    setAudioDevice,
    setAudioExclusive,
}
export type { AudioDeviceInfo, AudioOutputMode, AudioProbeResult }
