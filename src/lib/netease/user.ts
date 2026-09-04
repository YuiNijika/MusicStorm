import { setCookiesFromApi } from "@/lib/netease/auth-cookie"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import type { Playlist } from "@/lib/types"

type NeteaseProfile = {
    userId: number
    nickname: string
    avatarUrl: string
    /** 网易云 vipType：0=无，1~10=音乐包（按等级），11=黑胶 VIP，110=黑胶 SVIP */
    vipType: number
}

type AccountData = {
    code?: number
    cookie?: string
    account?: { id?: number } | null
    profile?: {
        userId?: number
        nickname?: string
        avatarUrl?: string
        vipType?: number
    } | null
}

// 会员档位：free=未开通，vip=音乐包/黑胶，svip=黑胶 SVIP
type VipTier = "free" | "vip" | "svip"

/**
 * profile → 档位标签。
 * 网易云网页端 profile 的 vipType：0=无，1~10=音乐包（按等级），11=黑胶 VIP，
 * 110=黑胶 SVIP（实测 SVIP 账号返回 110，非 11；网页端 profile 不返回 vipRights）。
 */
function resolveVipTier(profile: NeteaseProfile | null | undefined): VipTier {
    if (!profile) {
        return "free"
    }
    if (profile.vipType === 110) {
        return "svip"
    }
    if (profile.vipType > 0) {
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

    // 扫码登录（eapi）不下发 __csrf，登录态 weapi 响应（nuser/account/get）会回传，
    // 捕获持久化，供创建歌单/改名等需要 csrf_token 的 weapi 写接口使用
    if (data.cookie) {
        setCookiesFromApi(data.cookie)
    }

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

type SigninOutcome = "success" | "already" | "failed"

// 每日签到：type=0 安卓端（3 经验），type=1 网页端（2 经验）
// 已签渠道的回应按 outcome 分类：success 才算有效签到，already 幂等，failed 可重试
async function dailySignin(
    type: 0 | 1 = 0,
): Promise<{ outcome: SigninOutcome; message: string }> {
    let point = 0
    try {
        const data = await neteaseRequest<{
            code?: number
            point?: number
            msg?: string
        }>({
            path: NETEASE_PATHS.dailySignin,
            method: "POST",
            params: { type, timestamp: Date.now() },
            skipCache: true,
        })
        if (data.code === 200) {
            point = data.point ?? 0
            // +0 经验没有信息量，不展示
            return {
                outcome: "success",
                message:
                    point > 0 ? `签到成功，+${point} 经验` : "签到成功",
            }
        }
        const text = data.msg ?? "签到失败"
        return /重复|已签/.test(text)
            ? { outcome: "already", message: "今日已签到" }
            : { outcome: "failed", message: text }
    } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        // 外部源对重复签到返回 HTTP 403，官方结构返回 code -2 / 重复操作
        if (/403|重复|已签/.test(text)) {
            return { outcome: "already", message: "今日已签到" }
        }
        return { outcome: "failed", message: text }
    }
}

export {
    dailySignin,
    fetchUserAccount,
    fetchUserPlaylists,
    fetchUserPlaylistsDetailed,
    resolveVipTier,
}
export type { NeteaseProfile, UserPlaylistsResult, VipTier }