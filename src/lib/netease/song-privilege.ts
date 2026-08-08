// 网易云 song/url 条目：外层 code 常为 200，可播性看 data[0].url/data[0].code/fee/payed
// 参考 CloudMusicAPI check_music：data[0].code === 200 才可播
// fee 常见：0 免费 · 1 试听/VIP · 4 会员专享 · 8 数字专辑

export type SongUrlItem = {
    id?: number
    url?: string | null
    br?: number
    size?: number
    code?: number
    fee?: number
    payed?: number
    type?: string | null
    level?: string | null
    freeTrialInfo?: unknown
    freeTrialPrivilege?: {
        resConsumable?: boolean
        userConsumable?: boolean
        cannotListenReason?: number | null
        playReason?: number | null
    }
    freeTimeTrialPrivilege?: {
        resConsumable?: boolean
        userConsumable?: boolean
        remainTime?: number
    }
    message?: string | null
    flag?: number
}

function isSongUrlPlayable(item: SongUrlItem | undefined | null): boolean {
    if (!item) {
        return false
    }
    const url = typeof item.url === "string" ? item.url.trim() : ""
    if (!url) {
        return false
    }
    if (item.code != null && item.code !== 200) {
        return false
    }
    return true
}

function hasUsableTrial(item: SongUrlItem): boolean {
    return (
        item.freeTrialPrivilege?.userConsumable === true ||
        item.freeTimeTrialPrivilege?.userConsumable === true
    )
}

function describePaywall(item: SongUrlItem): string | null {
    const fee = item.fee ?? 0
    const payed = item.payed ?? 0
    if (fee <= 0 || payed !== 0 || hasUsableTrial(item)) {
        return null
    }
    if (fee === 1) {
        return "该歌曲需 VIP 或购买后才能完整播放"
    }
    if (fee === 4) {
        return "该歌曲为 VIP 专享，请开通会员后重试"
    }
    if (fee === 8) {
        return "该歌曲为数字专辑曲目，请购买后播放"
    }
    return "该歌曲需购买或开通会员后才能播放"
}

// 用户可读失败原因；fee 优先于 -110，避免 VIP 误报暂无版权
function describeSongUrlFailure(item: SongUrlItem | undefined | null): string {
    if (!item) {
        return "无法获取播放地址"
    }

    if (item.message && String(item.message).trim()) {
        return String(item.message).trim()
    }

    const paywall = describePaywall(item)
    if (paywall) {
        return paywall
    }

    const entryCode = item.code
    if (entryCode === -110) {
        return "暂无版权，无法播放"
    }
    if (entryCode === 404) {
        return "歌曲不存在或已下架"
    }
    if (entryCode != null && entryCode !== 200) {
        return `无法播放（错误码 ${entryCode}）`
    }

    if (!item.url) {
        return "亲爱的，暂无版权"
    }

    return "暂时无法播放该歌曲"
}

// 多档 br 失败时选信息更完整的一条
function pickRicherSongUrlEntry(
    a: SongUrlItem | undefined,
    b: SongUrlItem | undefined,
): SongUrlItem | undefined {
    if (!a) {
        return b
    }
    if (!b) {
        return a
    }
    const score = (item: SongUrlItem) => {
        let s = 0
        if (item.fee != null) s += 4
        if (item.code != null) s += 3
        if (item.payed != null) s += 2
        if (item.message) s += 2
        if (item.freeTrialPrivilege) s += 1
        return s
    }
    return score(b) > score(a) ? b : a
}

export {
    describeSongUrlFailure,
    isSongUrlPlayable,
    pickRicherSongUrlEntry,
}