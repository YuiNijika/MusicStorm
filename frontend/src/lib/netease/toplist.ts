import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { neteaseCoverUrl } from "@/lib/netease/cover-url"

export type ToplistItem = {
    id: string
    title: string
    coverUrl: string
    description?: string
}

type ToplistData = {
    code?: number
    list?: Array<{
        id?: number
        name?: string
        coverImgUrl?: string
        description?: string
    }>
}

// 官方榜单列表；榜单本质是特殊歌单，点进用 playlist/detail 取内容
async function fetchToplists(): Promise<ToplistItem[]> {
    const data = await neteaseRequest<ToplistData>({
        path: NETEASE_PATHS.toplist,
    })
    return (data.list ?? [])
        .filter((item) => item.id != null)
        .map((item) => ({
            id: String(item.id),
            title: item.name?.trim() || "未知榜单",
            coverUrl: neteaseCoverUrl(item.coverImgUrl, 300),
            description: item.description?.trim() || undefined,
        }))
}

export { fetchToplists }
