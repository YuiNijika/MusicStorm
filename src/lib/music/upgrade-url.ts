// 网易云封面/头像仍下发 http://p1.music.126.net 这类地址，HTTPS 页面与 macOS WKWebView
// 都会按混合内容/ATS 拒绝。126.net / 163.com 的 https 端点可用，这里递归升级响应里的
// 网易云 http 媒体地址，其余域名原样保留，避免误改不支持 TLS 的第三方地址。

function upgradeNeteaseUrl(url: string): string {
    if (!url.startsWith("http://")) {
        return url
    }
    try {
        const parsed = new URL(url)
        const host = parsed.hostname
        const isNetease =
            host === "126.net" ||
            host.endsWith(".126.net") ||
            host === "163.com" ||
            host.endsWith(".163.com")
        if (!isNetease) {
            return url
        }
        parsed.protocol = "https:"
        return parsed.toString()
    } catch {
        return url
    }
}

// 递归遍历响应，升级所有网易云 http 媒体地址，覆盖歌曲/专辑/歌手/歌单/MV/电台/用户封面字段
function upgradeNeteaseUrls(value: unknown): unknown {
    if (typeof value === "string") {
        return upgradeNeteaseUrl(value)
    }
    if (Array.isArray(value)) {
        return value.map(upgradeNeteaseUrls)
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = upgradeNeteaseUrls(item)
        }
        return out
    }
    return value
}

export { upgradeNeteaseUrl, upgradeNeteaseUrls }
