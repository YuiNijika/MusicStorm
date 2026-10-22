import { searchBilibiliTracks } from "@/lib/bilibili/search"
import {
    hasUsableTrial,
    type SongUrlItem,
} from "@/lib/netease/song-privilege"
import type { Track } from "@/lib/types"
import { isWebMode } from "@/lib/web-mode"

const MAX_RESULTS = 8
const MIN_TITLE_SCORE = 50
const fallbackCache = new Map<string, Track>()
const fallbackRequests = new Map<string, Promise<Track | null>>()

function normalize(value: string): string {
    return value
        .toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "")
}

function scoreCandidate(candidate: Track, source: Track): number {
    const sourceTitle = normalize(source.title)
    const candidateTitle = normalize(candidate.title)
    if (!sourceTitle || !candidateTitle) {
        return 0
    }
    let score = 0
    if (candidateTitle === sourceTitle) {
        score += 80
    } else if (
        candidateTitle.includes(sourceTitle) ||
        sourceTitle.includes(candidateTitle)
    ) {
        score += 50
    } else {
        return 0
    }
    const sourceArtist = normalize(source.artist)
    const candidateArtist = normalize(candidate.artist)
    if (
        sourceArtist &&
        candidateArtist &&
        (candidateArtist.includes(sourceArtist) ||
            sourceArtist.includes(candidateArtist))
    ) {
        score += 20
    }
    if (source.durationMs > 0 && candidate.durationMs > 0) {
        const diff = Math.abs(source.durationMs - candidate.durationMs)
        if (diff <= 3_000) {
            score += 15
        } else if (diff <= 10_000) {
            score += 8
        }
    }
    return score
}

async function resolveFallbackSource(track: Track): Promise<Track | null> {
    const queries = [
        `${track.title} ${track.artist}`.trim(),
        track.title.trim(),
    ].filter((value, index, list) => value && list.indexOf(value) === index)

    let best: Track | null = null
    let bestScore = 0
    for (const query of queries) {
        try {
            const candidates = await searchBilibiliTracks(query, MAX_RESULTS)
            for (const candidate of candidates) {
                const score = scoreCandidate(candidate, track)
                if (score > bestScore) {
                    best = candidate
                    bestScore = score
                }
            }
            if (bestScore >= MIN_TITLE_SCORE + 20) {
                break
            }
        } catch {
            // Retry on the next playback instead of caching a transient failure
        }
    }
    return bestScore >= MIN_TITLE_SCORE ? best : null
}

async function findFallbackSource(track: Track): Promise<Track | null> {
    if (track.source !== "netease" || isWebMode()) {
        return null
    }

    const cacheKey = `${track.title}\u0000${track.artist}\u0000${track.durationMs}`
    const cached = fallbackCache.get(cacheKey)
    if (cached) {
        return cached
    }

    const pending = fallbackRequests.get(cacheKey)
    if (pending) {
        return pending
    }

    const request = resolveFallbackSource(track)
        .then((resolved) => {
            if (resolved) {
                fallbackCache.set(cacheKey, resolved)
            }
            return resolved
        })
        .finally(() => {
            fallbackRequests.delete(cacheKey)
        })
    fallbackRequests.set(cacheKey, request)
    return request
}

function forgetFallbackSource(track: Track): void {
    const cacheKey = `${track.title}\u0000${track.artist}\u0000${track.durationMs}`
    fallbackCache.delete(cacheKey)
}

function isCopyrightUnavailable(
    entry: SongUrlItem | undefined,
    reason: string,
): boolean {
    if (
        entry &&
        (entry.fee ?? 0) > 0 &&
        (entry.payed ?? 0) === 0 &&
        !hasUsableTrial(entry)
    ) {
        return false
    }
    if (entry?.code === -110) {
        return true
    }
    if (/VIP|会员|购买|数字专辑/.test(reason)) {
        return false
    }
    return /暂无版权|版权|已下架|歌曲不存在/.test(reason)
}

export {
    findFallbackSource,
    forgetFallbackSource,
    isCopyrightUnavailable,
    scoreCandidate,
}
