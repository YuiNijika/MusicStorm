import { KSM, type KSMJsonValue } from "kasumi-bridge"

import { initializeKasumiBridge } from "./runtime"

export type UnlistenFn = () => void

interface TauriEvent<T> {
    event: string
    id: number
    payload: T
}

const LOCAL_EVENT = "musicstorm:tauri-event"
let eventId = 0

function dispatchLocal<T>(event: string, payload: T): void {
    window.dispatchEvent(
        new CustomEvent<TauriEvent<T>>(LOCAL_EVENT, {
            detail: { event, id: ++eventId, payload },
        }),
    )
}

export async function listen<T>(
    event: string,
    handler: (event: TauriEvent<T>) => void,
): Promise<UnlistenFn> {
    const local = (nativeEvent: Event) => {
        const detail = (nativeEvent as CustomEvent<TauriEvent<T>>).detail
        if (detail?.event === event) {
            handler(detail)
        }
    }
    window.addEventListener(LOCAL_EVENT, local)

    let unsubscribe = () => {}
    if (initializeKasumiBridge()) {
        unsubscribe = KSM.extensions.on<Record<string, KSMJsonValue>>(
            "app.musicstorm.event",
            (envelope) => {
                if (envelope.event !== event) {
                    return
                }
                handler({
                    event,
                    id: ++eventId,
                    payload: envelope.payload as T,
                })
            },
        )
    }

    return () => {
        window.removeEventListener(LOCAL_EVENT, local)
        unsubscribe()
    }
}

export async function emit<T extends KSMJsonValue>(
    event: string,
    payload: T,
): Promise<void> {
    dispatchLocal(event, payload)
    if (!initializeKasumiBridge()) {
        return
    }
    try {
        await KSM.extensions.invoke(
            "app.musicstorm.command",
            {
                command: "event_emit",
                args: { event, payload },
            },
            10000,
        )
    } catch (error) {
        console.warn(`[kasumi] could not emit ${event}`, error)
    }
}
