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

export {
    MIRROR_PREFIX,
    UPDATE_SOURCE_EVENT,
    readUpdateSource,
    resolveUpdateUrl,
    setUpdateSource,
}
export type { UpdateSource }
