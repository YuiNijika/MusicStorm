/** 打开网易云官网注册 */

const NETEASE_REGISTER_URL = "https://music.163.com"

async function openNeteaseRegister(): Promise<void> {
    try {
        const { openUrl } = await import("@tauri-apps/plugin-opener")
        await openUrl(NETEASE_REGISTER_URL)
        return
    } catch {
        // 非 Tauri 或 opener 失败
    }
    window.open(NETEASE_REGISTER_URL, "_blank", "noopener,noreferrer")
}

export { NETEASE_REGISTER_URL, openNeteaseRegister }