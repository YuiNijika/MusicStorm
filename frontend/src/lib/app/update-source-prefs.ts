const DETECT_SOURCE_KEY = "musicstorm-update-source"
const DOWNLOAD_SOURCE_KEY = "musicstorm-download-source"
const UPDATE_SOURCE_EVENT = "musicstorm-update-source"
const DOWNLOAD_SOURCE_EVENT = "musicstorm-download-source"

// 更新源：GitHub 官方仓库（默认）或 gh-proxy.com 镜像加速（国内访问 GitHub 受限时用）。
// 检测（API/更新日志）与下载（安装包）分开配置：检测走 WebView fetch（随系统代理），
// 下载走 Rust reqwest（不随系统代理），两者网络条件不同，各自可独立切镜像。
type UpdateSource = "github" | "mirror"

const MIRROR_PREFIX = "https://gh-proxy.com/"

function readDetectSource(): UpdateSource {
    try {
        return window.localStorage.getItem(DETECT_SOURCE_KEY) === "mirror"
            ? "mirror"
            : "github"
    } catch {
        return "github"
    }
}

function setDetectSource(source: UpdateSource): void {
    window.localStorage.setItem(DETECT_SOURCE_KEY, source)
    window.dispatchEvent(new Event(UPDATE_SOURCE_EVENT))
}

function readDownloadSource(): UpdateSource {
    try {
        const value = window.localStorage.getItem(DOWNLOAD_SOURCE_KEY)
        if (value === "mirror" || value === "github") {
            return value
        }
    } catch {
        // fallthrough
    }
    // 未单独设置过：跟随检测源（老用户行为兼容）
    return readDetectSource()
}

function setDownloadSource(source: UpdateSource): void {
    window.localStorage.setItem(DOWNLOAD_SOURCE_KEY, source)
    window.dispatchEvent(new Event(DOWNLOAD_SOURCE_EVENT))
}

/** 按检测源给 GitHub URL 加镜像前缀 */
function resolveUpdateUrl(url: string): string {
    if (!url) {
        return url
    }
    return readDetectSource() === "mirror" ? `${MIRROR_PREFIX}${url}` : url
}

/** 按下载源给安装包下载 URL 加镜像前缀 */
function resolveDownloadUrl(url: string): string {
    if (!url) {
        return url
    }
    return readDownloadSource() === "mirror" ? `${MIRROR_PREFIX}${url}` : url
}

/**
 * 返回候选源列表：首选当前配置的源，第二个为另一个源（兜底）。
 * 直连限流 / 镜像不可达时自动切换，覆盖两侧故障。
 */
function updateSourceCandidates(url: string): string[] {
    if (!url) {
        return []
    }
    const primary = resolveUpdateUrl(url)
    const fallback =
        readDetectSource() === "mirror" ? url : `${MIRROR_PREFIX}${url}`
    return fallback === primary ? [primary] : [primary, fallback]
}

/**
 * 下载候选源：首选当前下载源，失败自动切另一个源兜底
 * （如 Rust 直连 GitHub 失败 → 镜像，或反之）。
 */
function downloadSourceCandidates(url: string): string[] {
    if (!url) {
        return []
    }
    const primary = resolveDownloadUrl(url)
    const fallback =
        readDownloadSource() === "mirror" ? url : `${MIRROR_PREFIX}${url}`
    return fallback === primary ? [primary] : [primary, fallback]
}

export {
    DOWNLOAD_SOURCE_EVENT,
    MIRROR_PREFIX,
    UPDATE_SOURCE_EVENT,
    downloadSourceCandidates,
    readDetectSource,
    readDownloadSource,
    resolveDownloadUrl,
    resolveUpdateUrl,
    setDetectSource,
    setDownloadSource,
    updateSourceCandidates,
}
export type { UpdateSource }
