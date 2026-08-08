import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"

type LikelistData = {
    code?: number
    ids?: number[]
}

type LikeData = {
    code?: number
}


async function fetchLikelist(uid: number): Promise<string[]> {
    const data = await neteaseRequest<LikelistData>({
        path: NETEASE_PATHS.likelist,
        params: {
            uid,
            timestamp: Date.now(),
        },
    })
    return (data.ids ?? []).map(String)
}


async function setTrackLiked(trackId: string, like: boolean): Promise<void> {
    const data = await neteaseRequest<LikeData>({
        path: NETEASE_PATHS.like,
        params: {
            id: trackId,
            like,
            timestamp: Date.now(),
        },
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(`喜欢操作失败: ${data.code}`)
    }
}

export { fetchLikelist, setTrackLiked }