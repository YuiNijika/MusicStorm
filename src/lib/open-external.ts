/** 在系统浏览器打开外链（Tauri opener → window.open 兜底） */

async function openExternalUrl(url: string): Promise<void> {
    try {
        const { openUrl } = await import("@tauri-apps/plugin-opener")
        await openUrl(url)
        return
    } catch {
        // 非 Tauri 或 opener 失败
    }
    window.open(url, "_blank", "noopener,noreferrer")
}

const GITHUB_REPO_URL = "https://github.com/YuiNijika/MusicStorm"

export { GITHUB_REPO_URL, openExternalUrl }