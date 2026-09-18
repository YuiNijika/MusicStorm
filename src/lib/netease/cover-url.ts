// 网易云封面 CDN 支持 param 参数按需出图。接口有时直接返回未裁剪的原图地址，
// 列表场景里大图解码是移动端内存的主要来源，统一在映射层收敛请求尺寸。

const NETEASE_COVER_HOST_SUFFIXES = [".126.net", ".163.com"]

function isNeteaseCoverHost(hostname: string): boolean {
    return NETEASE_COVER_HOST_SUFFIXES.some((suffix) =>
        hostname.endsWith(suffix),
    )
}

// 已有 param 且不超过目标尺寸时保留，避免把源站刻意给的更小图放大请求
function neteaseCoverUrl(
    url: string | null | undefined,
    maxWidth: number,
    maxHeight: number = maxWidth,
): string {
    const raw = url?.trim()
    if (!raw) {
        return ""
    }
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        return raw
    }
    if (!isNeteaseCoverHost(parsed.hostname)) {
        return raw
    }
    const param = parsed.searchParams.get("param")
    if (param) {
        const match = /^(\d+)y(\d+)$/.exec(param)
        if (!match) {
            return raw
        }
        const width = Number(match[1])
        const height = Number(match[2])
        if (width <= maxWidth && height <= maxHeight) {
            return raw
        }
    }
    parsed.searchParams.set("param", `${maxWidth}y${maxHeight}`)
    return parsed.toString()
}

export { neteaseCoverUrl }
