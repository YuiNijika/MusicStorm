/** 启动时探测内置 API；失败仅提示，不静默改设置 */

import { ensureIntegratedApiIfNeeded } from "@/lib/netease/integrated-api"
import { notifyWarning } from "@/lib/notify"

const BOOT_TOAST_ID = "integrated-api-boot"

async function bootIntegratedApiProbe(): Promise<void> {
    const status = await ensureIntegratedApiIfNeeded()
    if (!status || status.ready) {
        return
    }
    notifyWarning("内置 API 不可用", {
        id: BOOT_TOAST_ID,
        description: status.message,
        timeout: 6_500,
    })
}

export { bootIntegratedApiProbe }