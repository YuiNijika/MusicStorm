import { fetchImageAsDataUrl } from "@/lib/local/cover"
import { getLyricOverride, setLyricOverride } from "@/lib/lyric/overrides"
import { getCoverOverride, setCoverOverride } from "@/lib/music/cover-overrides"
import { fetchLyricText } from "@/lib/netease/lyric"
import { searchNeteaseTracks } from "@/lib/netease/search"
import type { Track } from "@/lib/types"

type NeteaseMetadataResult = {
    matched: Track | null
    coverApplied: boolean
    lyricApplied: boolean
}

function normalizeLabel(value: string): string {
    return value
        .toLocaleLowerCase("zh-CN")
        .replace(/[（(][^）)]*[）)]/g, "")
        .replace(/[\s·・,，.。'"“”‘’_\-/\\]+/g, "")
}

function artistTokens(value: string): string[] {
    return value
        .split(/\s*(?:\/|、|,|，|&|＆|feat\.?|ft\.?)\s*/i)
        .map(normalizeLabel)
        .filter(Boolean)
}

function metadataMatchScore(local: Track, candidate: Track): number {
    const localTitle = normalizeLabel(local.title)
    const remoteTitle = normalizeLabel(candidate.title)
    const localArtists = artistTokens(local.artist)
    const remoteArtists = artistTokens(candidate.artist)

    let score = 0
    if (localTitle && localTitle === remoteTitle) score += 70
    else if (
        localTitle &&
        remoteTitle &&
        (localTitle.includes(remoteTitle) || remoteTitle.includes(localTitle))
    ) {
        score += 42
    }

    if (
        localArtists.some((artist) =>
            remoteArtists.some(
                (remote) =>
                    artist === remote || artist.includes(remote) || remote.includes(artist),
            ),
        )
    ) {
        score += 24
    }

    if (local.durationMs > 0 && candidate.durationMs > 0) {
        const delta = Math.abs(local.durationMs - candidate.durationMs)
        if (delta <= 2_500) score += 12
        else if (delta <= 6_000) score += 6
        else if (delta >= 20_000) score -= 12
    }

    return score
}

async function findNeteaseTrackMatch(track: Track): Promise<Track | null> {
    const query = [track.title, track.artist]
        .filter((value) => value && value !== "未知艺人")
        .join(" ")
    const candidates = await searchNeteaseTracks(query, 8)
    const ranked = candidates
        .map((candidate) => ({
            candidate,
            score: metadataMatchScore(track, candidate),
        }))
        .sort((a, b) => b.score - a.score)
    const best = ranked[0]
    return best && best.score >= 64 ? best.candidate : null
}

function needsNeteaseMetadata(track: Track): boolean {
    const hasCover = Boolean(track.coverUrl || getCoverOverride(track.id))
    const hasLyric = Boolean(
        track.lyricText || track.lrcPath || getLyricOverride(track.id),
    )
    return !hasCover || !hasLyric
}

async function applyNeteaseMetadata(
    track: Track,
    options: { onlyMissing?: boolean } = {},
): Promise<NeteaseMetadataResult> {
    const onlyMissing = options.onlyMissing ?? false
    const needsCover = !onlyMissing || (!track.coverUrl && !getCoverOverride(track.id))
    const needsLyric =
        !onlyMissing ||
        (!track.lyricText && !track.lrcPath && !getLyricOverride(track.id))

    if (!needsCover && !needsLyric) {
        return { matched: null, coverApplied: false, lyricApplied: false }
    }

    const matched = await findNeteaseTrackMatch(track)
    if (!matched) {
        return { matched: null, coverApplied: false, lyricApplied: false }
    }

    const [coverResult, lyricResult] = await Promise.allSettled([
        needsCover && matched.coverUrl
            ? fetchImageAsDataUrl(matched.coverUrl)
            : Promise.resolve(""),
        needsLyric ? fetchLyricText(matched.id) : Promise.resolve(""),
    ])

    const cover = coverResult.status === "fulfilled" ? coverResult.value : ""
    const lyric = lyricResult.status === "fulfilled" ? lyricResult.value : ""
    let coverApplied = false
    let lyricApplied = false

    // 两种元数据独立提交；封面 base64 触发 quota 时不能阻断歌词。
    if (lyric) {
        try {
            setLyricOverride(track.id, lyric)
            lyricApplied = true
        } catch {
            lyricApplied = false
        }
    }
    if (cover) {
        try {
            setCoverOverride(track.id, cover)
            coverApplied = true
        } catch {
            coverApplied = false
        }
    }

    return {
        matched,
        coverApplied,
        lyricApplied,
    }
}

export { applyNeteaseMetadata, findNeteaseTrackMatch, needsNeteaseMetadata }
export type { NeteaseMetadataResult }