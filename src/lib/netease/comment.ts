import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"

type NeteaseCommentUser = {
    userId?: number
    nickname?: string
    avatarUrl?: string
    vipType?: number
}

type NeteaseComment = {
    commentId: number
    content: string
    time: number
    likedCount: number
    liked: boolean
    user: NeteaseCommentUser
    beReplied?: Array<{
        user: NeteaseCommentUser
        content: string
    }>
    ipLocation?: { location?: string }
}

type SongCommentsData = {
    code?: number
    total?: number
    more?: boolean
    comments?: NeteaseComment[]
    hotComments?: NeteaseComment[]
    topComments?: NeteaseComment[]
}

type SongComments = {
    total: number
    more: boolean
    comments: NeteaseComment[]
    hotComments: NeteaseComment[]
}

async function fetchSongComments(
    id: string,
    options: { limit?: number; offset?: number; before?: number } = {},
): Promise<SongComments> {
    const data = await neteaseRequest<SongCommentsData>({
        path: NETEASE_PATHS.commentMusic,
        params: {
            id,
            limit: options.limit ?? 20,
            offset: options.offset ?? 0,
            before: options.before ?? 0,
        },
    })
    return {
        total: data.total ?? 0,
        more: data.more ?? false,
        comments: data.comments ?? [],
        hotComments: data.hotComments ?? [],
    }
}

type SongDetailV1Data = {
    code?: number
    songs?: Array<{ id?: number; starredNum?: number; playedNum?: number }>
}

type SongStats = {
    likedCount: number
    playCount: number
}

// v1 song/detail 才带红心量（starredNum）与播放量（playedNum）；游客态返回 0
async function fetchSongStats(id: string): Promise<SongStats> {
    const data = await neteaseRequest<SongDetailV1Data>({
        path: NETEASE_PATHS.songDetailV1,
        params: { id },
    })
    const song = data.songs?.[0]
    return {
        likedCount: song?.starredNum ?? 0,
        playCount: song?.playedNum ?? 0,
    }
}

type PostCommentData = {
    code?: number
    comment?: NeteaseComment
}

/**
 * 发布/回复歌曲评论。
 * replyTo 传入被回复评论时走回复，否则为普通评论。
 */
async function postSongComment(
    id: string,
    content: string,
    replyTo?: { commentId: number; nickname: string },
): Promise<NeteaseComment> {
    const data = await neteaseRequest<PostCommentData>({
        path: NETEASE_PATHS.comment,
        method: "POST",
        params: {
            t: 1,
            type: 1,
            id,
            content,
            ...(replyTo ? { commentId: replyTo.commentId } : {}),
        },
    })
    const comment = data.comment
    if (!comment) {
        throw new Error("评论发布失败")
    }
    return comment
}

export { fetchSongComments, fetchSongStats, postSongComment }
export type { NeteaseComment, SongComments, SongStats }
