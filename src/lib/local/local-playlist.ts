// 本地音乐附加到歌单：把本地曲目按目标歌单 id 记进本地 DB，
// 网易云歌单详情页读取后把本地曲目按锚点合并展示，实现「本地音乐插入网易云歌单」。
// 锚点是添加那一刻歌单最前的云端曲目 id，云端列表最新在前，
// 本地条目插到锚点前面即可还原「新添加的排最前」的时间序。
// 锚点封面是添加那一刻的云端歌单封面，列表页据此判断云端首曲是否已变，
// 决定歌单封面跟随本地条目还是沿用云端。

import { invoke } from "@tauri-apps/api/core"

export type LocalPlaylistTrackRow = {
    id: string
    title: string
    artist: string
    album: string
    durationMs: number
    coverUrl?: string | null
    filePath?: string | null
    addedAt: number
    anchorTrackId?: string | null
}

export function addLocalTracksToPlaylist(
    playlistId: string,
    trackIds: string[],
    anchorTrackId?: string | null,
    anchorCover?: string | null,
): Promise<void> {
    return invoke("db_local_add_to_playlist", {
        input: {
            playlistId,
            trackIds,
            anchorTrackId: anchorTrackId ?? null,
            anchorCover: anchorCover ?? null,
        },
    })
}

export function listLocalTracksForPlaylist(
    playlistId: string,
): Promise<LocalPlaylistTrackRow[]> {
    return invoke("db_local_for_playlist", { playlistId })
}

export function removeLocalTracksFromPlaylist(
    playlistId: string,
    trackIds: string[],
): Promise<void> {
    return invoke("db_local_remove_from_playlist", { playlistId, trackIds })
}

export type LocalPlaylistCover = {
    playlistId: string
    coverUrl: string | null
    anchorCover: string | null
    anchorTrackId: string | null
}

// 云端排头信息：歌单当前第一首云端曲目的 id 与封面，列表页据此与锚点比较
export type PlaylistHeadInfo = {
    firstTrackId: string | null
    firstCoverUrl: string | null
}

// 批量取每个歌单最新本地条目的封面接管信息，歌单列表页用
async function fetchLocalPlaylistCovers(
    playlistIds: string[],
): Promise<Map<string, LocalPlaylistCover>> {
    if (playlistIds.length === 0) {
        return new Map()
    }
    try {
        const rows = await invoke<LocalPlaylistCover[]>(
            "db_local_playlist_covers",
            { playlistIds },
        )
        return new Map(rows.map((row) => [row.playlistId, row]))
    } catch {
        return new Map()
    }
}

// 歌单列表封面接管规则，与详情页合并逻辑对齐：
// 本地条目排头（无云端第一首、无锚点，或锚点曲目就是当前云端第一首）且取得到本地封面
// 时用本地封面；否则云端排头，用云端第一首封面（取不到回退歌单封面）
function resolvePlaylistCover(
    cloudCover: string,
    local: LocalPlaylistCover | undefined,
    head?: PlaylistHeadInfo | undefined,
): string {
    if (local?.coverUrl) {
        const firstCloud = head?.firstTrackId ?? null
        const localAtFront =
            !firstCloud || !local.anchorTrackId || local.anchorTrackId === firstCloud
        if (localAtFront) {
            return local.coverUrl
        }
        return head?.firstCoverUrl ?? cloudCover
    }
    return cloudCover
}

export {
    fetchLocalPlaylistCovers,
    resolvePlaylistCover,
}