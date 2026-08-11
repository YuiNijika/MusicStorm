/**
 * 网页版环境判定。
 *
 * 网页版 = 浏览器直接运行（无 Tauri 运行时），能力比桌面版少：
 * 播放强制 H5、网易云 API 固定走官方外部源、无窗口/托盘/快捷键等桌面能力。
 * 桌面版通过 `__TAURI_INTERNALS__` 注入标记区分。
 */
function isWebMode(): boolean {
    return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)
}

export { isWebMode }
