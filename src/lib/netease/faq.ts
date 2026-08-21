import { getApiSettings } from "@/lib/netease/api-settings"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"

type FaqItem = {
    question: string
    answer: string
}

// 内置模式没有独立后端，回退到内置数组；内容与官方源 NeteaseProxy.php 的 FAQ_ITEMS 保持一致
const BUILTIN_FAQ: FaqItem[] = [
    {
        question: "如何播放歌曲？",
        answer: "在首页、搜索或歌单中点击歌曲即可播放；底部播放条支持暂停、上一首、下一首、倍速、红心与评论。",
    },
    {
        question: "网易云资源加载失败怎么办？",
        answer: "先确认网络可用；封面加载失败会在稍后自动重试，播放地址失败可切换到其他音质或音源。",
    },
    {
        question: "如何登录网易云账号？",
        answer: "进入设置页的「账号」tab，选择扫码登录或手机号验证码登录即可同步歌单与红心。",
    },
    {
        question: "如何切换音质？",
        answer: "播放设置中可切换音质：标准 128k、较高 192k、极高 320k 与无损优先，需账号权限支持。",
    },
    {
        question: "如何调整播放速度？",
        answer: "播放条上的速度胶囊可切换 0.5x 到 2x 的倍速，再次点击恢复原速。",
    },
    {
        question: "如何导入本地音乐？",
        answer: "在本地曲库中选择文件夹或单个文件导入，应用会读取标签信息并建立缓存封面。",
    },
    {
        question: "更新检查多久执行一次？",
        answer: "默认每 5 小时检查一次 GitHub Releases，可在设置页「更新」tab 手动刷新。",
    },
]

async function fetchFaqItems(): Promise<FaqItem[]> {
    if (getApiSettings().mode === "integrated") {
        return BUILTIN_FAQ
    }
    const data = await neteaseRequest<FaqItem[] | { data?: FaqItem[] }>({
        path: NETEASE_PATHS.faq,
        method: "GET",
    })
    // 官方源返回统一 envelope，data 为数组；第三方源可能直接给数组
    if (Array.isArray(data)) {
        return data
    }
    const items = data?.data
    return Array.isArray(items) ? items : []
}

export { BUILTIN_FAQ, fetchFaqItems }
export type { FaqItem }