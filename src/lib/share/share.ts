import { isWebMode } from "@/lib/web-mode"
import type { Track } from "@/lib/types"

// 分享落地页：网页版可直接播放在线曲目（hash 路由 `#play?id=`）
const WEB_PLAYER_URL = "https://music.miomoe.cn/player.html"

// 自定义协议：`musicstorm://play?id=<id>`，用于浏览器探测/打开本机已安装的 MusicStorm 应用
const APP_PROTOCOL = "musicstorm"

export type SharePlatformId =
    | "qq"
    | "qzone"
    | "wechat"
    | "moments"
    | "facebook"
    | "x"
    | "telegram"
    | "weibo"

export type ShareTarget = {
    id: SharePlatformId
    /** 主文案 */
    label: string
    /** 分享到该平台需要面板（无公开网页分享接口：仅复制链接 + 二维码），而不是直接跳转 */
    panel?: boolean
    /** 构造分享意图地址；返回 null 表示当前不可用 */
    buildUrl: (
        link: string,
        title: string,
        summary: string,
    ) => string | null
}

/** 是否为可分享的曲目：仅网易云在线曲目可迁移到网页版直放 */
function isShareableTrack(track: Track | null | undefined): boolean {
    return Boolean(track && track.source === "netease" && track.id)
}

/** 导出曲名 → 网页站深链（hash 路由 `#play?id=<songId>`，规避静态部署丢 query） */
function buildPlayLink(track: Track): string | null {
    if (!isShareableTrack(track)) {
        return null
    }
    // 网页版直接在当前地址上拼接，保证域名跟随部署环境
    const base = isWebMode()
        ? `${window.location.origin}${window.location.pathname}`
        : WEB_PLAYER_URL
    return `${base}#play?id=${encodeURIComponent(track.id)}`
}

/** 导出曲名 → 应用自定义协议深链（`musicstorm://play?id=<songId>`），供已安装应用直接打开 */
function buildAppLink(track: Track): string | null {
    if (!isShareableTrack(track)) {
        return null
    }
    return `${APP_PROTOCOL}://play?id=${encodeURIComponent(track.id)}`
}

// 分享文案长度上限：避免标题/摘要过长导致分享接口拒绝或 URL 超长
const TITLE_MAX = 60
const SUMMARY_MAX = 140

function truncate(value: string, max: number): string {
    const cleaned = value.replace(/\s+/g, " ").trim()
    if (cleaned.length <= max) {
        return cleaned
    }
    return `${cleaned.slice(0, max - 1)}…`
}

function buildShareTitle(track: Track): string {
    return truncate(`${track.title} · ${track.artist}`, TITLE_MAX)
}

function buildShareSummary(track: Track): string {
    return truncate(
        `推荐一首歌：《${track.title}》${track.artist}，在 MusicStorm 上在线听`,
        SUMMARY_MAX,
    )
}

function escapeQuery(value: string): string {
    return encodeURIComponent(value)
}

/** 公开分享意图地址表。无公开网页分享接口的（QQ/微信/朋友圈）走 panel 提示复制/扫码。 */
const SHARE_TARGETS: ShareTarget[] = [
    {
        id: "qq",
        label: "QQ",
        // 桌面端不跳转：QQ 无公开网页分享，统一走复制/扫码面板（同微信）
        panel: true,
        buildUrl: () => null,
    },
    {
        id: "qzone",
        label: "QQ 空间",
        buildUrl: (link, title, summary) =>
            `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${escapeQuery(link)}&title=${escapeQuery(title)}&summary=${escapeQuery(summary)}&site=${escapeQuery(WEB_PLAYER_URL)}`,
    },
    {
        id: "wechat",
        label: "微信",
        panel: true,
        buildUrl: () => null,
    },
    {
        id: "moments",
        label: "朋友圈",
        panel: true,
        buildUrl: () => null,
    },
    {
        id: "facebook",
        label: "Facebook",
        buildUrl: (link, title) =>
            `https://www.facebook.com/sharer/sharer.php?u=${escapeQuery(link)}&quote=${escapeQuery(title)}`,
    },
    {
        id: "x",
        label: "X",
        buildUrl: (link, title) =>
            `https://twitter.com/intent/tweet?text=${escapeQuery(title)}&url=${escapeQuery(link)}`,
    },
    {
        id: "telegram",
        label: "Telegram",
        buildUrl: (link, title) =>
            `https://t.me/share/url?url=${escapeQuery(link)}&text=${escapeQuery(title)}`,
    },
    {
        id: "weibo",
        label: "微博",
        buildUrl: (link, title) =>
            `https://service.weibo.com/share/share.php?url=${escapeQuery(link)}&title=${escapeQuery(title)}`,
    },
]

/** 复制到剪贴板，返回是否成功 */
async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        try {
            const textarea = document.createElement("textarea")
            textarea.value = text
            textarea.style.position = "fixed"
            textarea.style.opacity = "0"
            document.body.appendChild(textarea)
            textarea.select()
            const ok = document.execCommand("copy")
            textarea.remove()
            return ok
        } catch {
            return false
        }
    }
}

export {
    APP_PROTOCOL,
    SHARE_TARGETS,
    WEB_PLAYER_URL,
    buildAppLink,
    buildPlayLink,
    buildShareSummary,
    buildShareTitle,
    copyText,
    isShareableTrack,
}