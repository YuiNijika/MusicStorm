import { KSM, type KSMJsonValue } from "kasumi-bridge"

import { isAndroid } from "@/lib/platform"

import { currentKasumiWindowId, initializeKasumiBridge } from "./runtime"

type CloseHandler = (event: { preventDefault: () => void }) => void | Promise<void>

class KasumiWindow {
    private maximized = false

    private target(): { windowId?: string } {
        const windowId = currentKasumiWindowId()
        return windowId ? { windowId } : {}
    }

    private appWindowCommand(command: string, args: Record<string, unknown>) {
        return KSM.extensions.invoke<Record<string, KSMJsonValue>>(
            "app.musicstorm.command",
            { command, args: args as unknown as KSMJsonValue },
        )
    }

    async hide(): Promise<void> {
        initializeKasumiBridge()
        if (isAndroid()) {
            return
        }
        await KSM.window.hide(this.target()).catch(() => undefined)
    }

    async show(): Promise<void> {
        initializeKasumiBridge()
        if (isAndroid()) {
            return
        }
        await KSM.window.show(this.target()).catch(() => undefined)
    }

    async minimize(): Promise<void> {
        initializeKasumiBridge()
        if (isAndroid()) {
            return
        }
        await KSM.window.minimize().catch(() => undefined)
    }

    async isMaximized(): Promise<boolean> {
        if (!initializeKasumiBridge() || isAndroid()) {
            return false
        }
        const state = await KSM.window.getState(this.target()).catch(() => null)
        if (state) {
            this.maximized = state.maximized
        }
        return this.maximized
    }

    async toggleMaximize(): Promise<void> {
        if (!initializeKasumiBridge() || isAndroid()) {
            return
        }
        const result = await this.appWindowCommand("window_toggle_maximize", {
            windowId: currentKasumiWindowId(),
        }).catch(() => null)
        if (result && typeof result.maximized === "boolean") {
            this.maximized = result.maximized
        } else {
            await this.isMaximized()
        }
    }

    async close(): Promise<void> {
        initializeKasumiBridge()
        await KSM.window.close().catch(() => undefined)
    }

    async destroy(): Promise<void> {
        await this.close()
    }

    async startDragging(): Promise<void> {
        if (!initializeKasumiBridge() || isAndroid()) {
            return
        }
        await this.appWindowCommand("window_start_dragging", {
            windowId: currentKasumiWindowId(),
        }).catch(() => undefined)
    }

    async onCloseRequested(handler: CloseHandler): Promise<() => void> {
        if (!initializeKasumiBridge()) {
            return () => {}
        }
        return KSM.extensions.on<Record<string, KSMJsonValue>>(
            "app.musicstorm.event",
            (envelope) => {
                if (envelope.event !== "window:close-requested") {
                    return
                }
                let prevented = false
                void Promise.resolve(handler({
                    preventDefault: () => {
                        prevented = true
                    },
                })).then(() => {
                    if (!prevented) {
                        void KSM.window.close()
                    }
                })
            },
        )
    }
}

let currentWindow: KasumiWindow | undefined

export function getCurrentWindow(): KasumiWindow {
    if (!initializeKasumiBridge()) {
        throw new Error("Kasumi window API is unavailable")
    }
    currentWindow ??= new KasumiWindow()
    return currentWindow
}
