const STORAGE_KEY = "musicstorm-update-source"
const UPDATE_SOURCE_EVENT = "musicstorm-update-source"

// 更新源：GitHub 官方仓库（默认）或 gh-proxy.com 镜像加速（国内访问 GitHub 受限时用）
type UpdateSource = "github" | "mirror"

const MIRROR_PREFIX = "https://gh-proxy.com/"

function readUpdateSource(): UpdateSource {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "mirror"
            ? "mirror"
            : "github"
    } catch {
        return "github"
    }
}

function setUpdateSource(source: UpdateSource): void {
    window.localStorage.setItem(STORAGE_KEY, source)
    window.dispatchEvent(new Event(UPDATE_SOURCE_EVENT))
}

/** 按当前更新源给 GitHub URL 加镜像前缀 */
function resolveUpdateUrl(url: string): string {
    if (!url) {
        return url
    }
    return readUpdateSource() === "mirror" ? `${MIRROR_PREFIX}${url}` : url
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
        readUpdateSource() === "mirror" ? url : `${MIRROR_PREFIX}${url}`
    return fallback === primary ? [primary] : [primary, fallback]
}

export {
    MIRROR_PREFIX,
    UPDATE_SOURCE_EVENT,
    readUpdateSource,
    resolveUpdateUrl,
    setUpdateSource,
    updateSourceCandidates,
}
export type { UpdateSource }
