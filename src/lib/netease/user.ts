import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import type { Playlist } from "@/lib/types"

type NeteaseProfile = {
    userId: number
    nickname: string
    avatarUrl: string
    /** 网易云 vipType：0=无，10=音乐包，11=黑胶 VIP */
    vipType: number
}

type AccountData = {
    code?: number
    account?: { id?: number } | null
    profile?: {
        userId?: number
        nickname?: string
        avatarUrl?: string
        vipType?: number
    } | null
}

// 会员档位：free=未开通，vip=音乐包/黑胶，svip=黑胶 SVIP（预留）
type VipTier = "free" | "vip" | "svip"

/**
 * vipType → 档位标签。
 * 网易云网页端 profile 只有 vipType：0=无、10=音乐包、11=黑胶（SVIP 与黑胶同为 11，
 * 网页端暂不返回 SVIP 区分字段），故 svip 仅作预留、当前恒不会命中。
 */
function resolveVipTier(vipType: number | null | undefined): VipTier {
    if (vipType === 10 || vipType === 11) {
        return "vip"
    }
    return "free"
}

type UserPlaylistItem = {
    id: number
    name: string
    coverImgUrl?: string
    trackCount?: number
    description?: string
    userId?: number
    /** 特殊类型：5 通常为「我喜欢的音乐」 */
    specialType?: number
}

type UserPlaylistData = {
    code?: number
    playlist?: UserPlaylistItem[]
}

type UserPlaylistsResult = {
    playlists: Playlist[]
    /** 红心歌单 id，通常为列表第一项 */
    likedSongPlaylistId: string | null
    subscribedIds: string[]
}

async function fetchUserAccount(): Promise<NeteaseProfile | null> {
    const data = await neteaseRequest<AccountData>({
        path: NETEASE_PATHS.userAccount,
        params: { timestamp: Date.now() },
    })

    const profile = data.profile
    if (!profile?.userId) {
        return null
    }

    return {
        userId: profile.userId,
        nickname: profile.nickname ?? "网易云用户",
        avatarUrl: profile.avatarUrl ?? "",
        vipType: profile.vipType ?? 0,
    }
}

function mapUserPlaylist(item: UserPlaylistItem): Playlist {
    return {
        id: String(item.id),
        title: item.name,
        coverUrl: item.coverImgUrl ?? "",
        trackIds: [],
        source: "netease",
        description: item.description ?? undefined,
        trackCount: item.trackCount,
    }
}

async function fetchUserPlaylists(uid: number): Promise<Playlist[]> {
    const result = await fetchUserPlaylistsDetailed(uid)
    return result.playlists
}

async function fetchUserPlaylistsDetailed(uid: number): Promise<UserPlaylistsResult> {
    const data = await neteaseRequest<UserPlaylistData>({
        path: NETEASE_PATHS.userPlaylist,
        params: {
            uid,
            limit: 1000,
            timestamp: Date.now(),
        },
    })
    const raw = data.playlist ?? []
    const playlists = raw.map(mapUserPlaylist)
    const liked =
        raw.find((item) => item.specialType === 5) ?? raw[0] ?? null
    const subscribedIds = raw
        .filter((item) => item.userId != null && item.userId !== uid)
        .map((item) => String(item.id))

    return {
        playlists,
        likedSongPlaylistId: liked ? String(liked.id) : null,
        subscribedIds,
    }
}

export { fetchUserAccount, fetchUserPlaylists, fetchUserPlaylistsDetailed, resolveVipTier }
export type { NeteaseProfile, UserPlaylistsResult, VipTier }