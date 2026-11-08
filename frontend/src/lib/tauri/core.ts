import { KSM, type KSMJsonValue } from "kasumi-bridge"

import { currentKasumiWindowId, initializeKasumiBridge } from "./runtime"

type InvokeArgs = Record<string, unknown>

const EQ_FREQUENCIES = [
    31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
]

const shortcutByAction = new Map<string, string>()

function stringArg(args: InvokeArgs, name: string): string {
    const value = args[name]
    if (typeof value !== "string") {
        throw new TypeError(`${name} must be a string`)
    }
    return value
}

function numberArg(args: InvokeArgs, name: string): number {
    const value = args[name]
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a number`)
    }
    return value
}

async function dispatchAppCommand<TResult>(
    command: string,
    args: InvokeArgs,
): Promise<TResult> {
    const result = await KSM.extensions.invoke<Record<string, KSMJsonValue>>(
        "app.musicstorm.command",
        { command, args: args as unknown as KSMJsonValue },
        60000,
    )
    return result as TResult
}

async function invokeBuiltin<TResult>(
    command: string,
    args: InvokeArgs,
): Promise<TResult | undefined> {
    switch (command) {
        case "exit_app":
            return (await KSM.app.exit()) as TResult
        case "open_devtools":
            return (await KSM.devtools.open()) as TResult
        case "audio_load":
            return (await KSM.audio.load({
                source: stringArg(args, "path"),
            })) as TResult
        case "audio_play":
            return (await KSM.audio.play()) as TResult
        case "audio_pause":
            return (await KSM.audio.pause()) as TResult
        case "audio_stop":
            return (await KSM.audio.stop()) as TResult
        case "audio_seek":
            return (await KSM.audio.seek({
                positionMs: numberArg(args, "positionMs"),
            })) as TResult
        case "audio_set_volume":
            return (await KSM.audio.volume.set({
                volume: numberArg(args, "volume"),
            })) as TResult
        case "audio_set_speed":
            return (await KSM.audio.speed.set({
                speed: numberArg(args, "rate"),
            })) as TResult
        case "audio_list_devices":
            return (await KSM.audio.devices.list()).devices as TResult
        case "audio_probe": {
            const devices = (await KSM.audio.devices.list()).devices
            return {
                available: devices.length > 0,
                backend: "kasumi",
                devices,
                message:
                    devices.length > 0 ? undefined : "无可用输出设备",
            } as TResult
        }
        case "audio_set_eq": {
            const gains = Array.isArray(args.gains)
                ? args.gains.map((value) => Number(value))
                : []
            const enabled = Boolean(args.enabled)
            const bands = gains.map((gain, index) => ({
                frequency: EQ_FREQUENCIES[index] ?? 0,
                gain: enabled ? gain : 0,
            }))
            return (await KSM.audio.eq.set({ bands })) as TResult
        }
        case "update_global_shortcut": {
            const action = stringArg(args, "action")
            const combo = stringArg(args, "combo").trim()
            const previous = shortcutByAction.get(action)
            if (previous && previous !== combo) {
                await KSM.globalShortcut
                    .unregister({ shortcut: previous })
                    .catch(() => undefined)
                shortcutByAction.delete(action)
            }
            if (!combo) {
                return { registered: false } as TResult
            }
            const result = await KSM.globalShortcut.register({
                shortcut: combo,
            })
            if (result.registered) {
                shortcutByAction.set(action, combo)
            }
            return result as TResult
        }
        case "audio_get_output_mode":
            return (await KSM.audio.output.getMode()) as TResult
        case "audio_set_device":
            return (await KSM.audio.devices.set({
                deviceId: stringArg(args, "deviceId"),
            })) as TResult
        case "audio_set_exclusive":
            return (await KSM.audio.output.setExclusive({
                enabled: Boolean(args.exclusive),
            })) as TResult
        case "get_storage_paths": {
            const dirs = await KSM.path.dirs()
            return {
                appDir: dirs.resource,
                configDir: dirs.data,
                cacheDir: dirs.cache,
                databasePath: `${dirs.data}/musicstorm.db`,
            } as TResult
        }
        default:
            return undefined
    }
}

export async function invoke<TResult = unknown>(
    command: string,
    args: InvokeArgs = {},
): Promise<TResult> {
    if (!initializeKasumiBridge()) {
        throw new Error(`Kasumi runtime is unavailable for ${command}`)
    }
    const builtin = await invokeBuiltin<TResult>(command, args)
    if (builtin !== undefined) {
        return builtin
    }
    return dispatchAppCommand<TResult>(command, args)
}

export function convertFileSrc(path: string): string {
    if (!path) {
        return ""
    }
    if (/^(?:data:|https?:|blob:|asset:)/i.test(path)) {
        return path
    }
    const normalized = path.replace(/^file:\/\//i, "").replace(/^\/([A-Za-z]:)/, "$1")
    const query = new URLSearchParams({
        path: normalized,
        windowId: currentKasumiWindowId() ?? "",
    })
    return `https://app.local/__ksm_file?${query.toString()}`
}
