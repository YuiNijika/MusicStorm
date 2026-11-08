import { KSM, type KSMExtensionContract } from "kasumi-bridge"

const MUSICSTORM_CONTRACT: KSMExtensionContract = {
    id: "musicstorm",
    commands: [
        {
            name: "app.musicstorm.command",
            platforms: ["windows", "android"],
            permissions: ["app.musicstorm"],
            args: {
                type: "object",
                properties: {
                    command: { type: "string" },
                    args: { type: "object", additionalProperties: true },
                },
                required: ["command", "args"],
                additionalProperties: false,
            },
            result: {
                type: "object",
                additionalProperties: true,
            },
        },
    ],
    events: [
        {
            name: "app.musicstorm.event",
            platforms: ["windows", "android"],
            payload: {
                type: "object",
                properties: {
                    event: { type: "string" },
                    payload: { type: "object", additionalProperties: true },
                },
                required: ["event", "payload"],
                additionalProperties: false,
            },
        },
    ],
}

let initialized = false
let available = false

function hasKasumiTransport(): boolean {
    if (typeof window === "undefined") {
        return false
    }
    return Boolean(
        (window.chrome?.webview &&
            typeof window.chrome.webview.postMessage === "function") ||
            (window.ksm &&
                typeof window.ksm.postMessage === "function"),
    )
}

export function initializeKasumiBridge(): boolean {
    if (initialized) {
        return available
    }
    initialized = true
    if (!hasKasumiTransport()) {
        return false
    }
    try {
        KSM.init()
        KSM.extensions.configure(MUSICSTORM_CONTRACT)
        ;(window as unknown as { __TAURI_INTERNALS__?: unknown })
            .__TAURI_INTERNALS__ = { kasumi: true }
        available = true
    } catch (error) {
        console.warn("[kasumi] bridge initialization failed", error)
        available = false
    }
    return available
}

export function isKasumiRuntime(): boolean {
    return initializeKasumiBridge()
}

export function currentKasumiWindowId(): string | undefined {
    if (typeof window === "undefined") {
        return undefined
    }
    return new URLSearchParams(window.location.search).get("windowId") ?? undefined
}
