const BILIBILI_IMAGE_HOSTS = [
    "bilibili.com",
    "hdslb.com",
    "biliimg.com",
    "bilivideo.com",
    "bilivideo.cn",
] as const

function isBilibiliImageUrl(value: string): boolean {
    try {
        const host = new URL(value.trim()).hostname.toLowerCase()
        return BILIBILI_IMAGE_HOSTS.some(
            (domain) => host === domain || host.endsWith(`.${domain}`),
        )
    } catch {
        return false
    }
}

// WebView 从 app.local 发起的图片请求会被 B 站防盗链判定为非法来源，
// 去掉 Referer 后 CDN 正常返回；原生缓存下载则显式补 B 站 Referer。
function bilibiliImageReferrerPolicy(
    value: string,
): "no-referrer" | undefined {
    return isBilibiliImageUrl(value) ? "no-referrer" : undefined
}

export { bilibiliImageReferrerPolicy, isBilibiliImageUrl }
