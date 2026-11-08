import { KSM } from "kasumi-bridge"

import { initializeKasumiBridge } from "./runtime"

export async function openUrl(url: string): Promise<void> {
    if (!initializeKasumiBridge()) {
        window.open(url, "_blank", "noopener,noreferrer")
        return
    }
    await KSM.shell.openExternal({ url })
}

export async function openPath(path: string): Promise<void> {
    if (!initializeKasumiBridge()) {
        return
    }
    await KSM.shell.openPath({ path })
}

export async function revealItemInDir(path: string): Promise<void> {
    if (!initializeKasumiBridge()) {
        return
    }
    await KSM.shell.showInFolder({ path })
}
