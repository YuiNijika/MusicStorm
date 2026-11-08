import { KSM } from "kasumi-bridge"

import { initializeKasumiBridge } from "./runtime"

export async function getVersion(): Promise<string> {
    if (!initializeKasumiBridge()) {
        return "0.0.0"
    }
    return (await KSM.app.getInfo()).version
}

export async function getTauriVersion(): Promise<string> {
    return "26"
}
