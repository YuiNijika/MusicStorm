type LyricLine = {
    timeMs: number
    text: string
}

const LINE_RE = /^(\[[\d:.]+\])+(.+)$/
const TIME_RE = /\[(\d+):(\d+)(?:[.:](\d+))?]/g

function parseLrc(lrc: string): LyricLine[] {
    const lines: LyricLine[] = []
    if (!lrc.trim()) {
        return lines
    }

    for (const raw of lrc.split(/\r?\n/)) {
        const match = raw.trim().match(LINE_RE)
        if (!match) {
            continue
        }
        const stamps = match[0].slice(0, match[0].length - match[2].length)
        const text = match[2].trim()
        if (!text) {
            continue
        }

        for (const stamp of stamps.matchAll(TIME_RE)) {
            const min = Number(stamp[1])
            const sec = Number(stamp[2])
            const frac = stamp[3] ?? "0"
            // 兼容 2~3 位毫秒
            const ms =
                frac.length <= 2
                    ? Number(frac.padEnd(2, "0")) * 10
                    : Number(frac.slice(0, 3))
            const timeMs = min * 60_000 + sec * 1000 + ms
            lines.push({ timeMs, text })
        }
    }

    lines.sort((a, b) => a.timeMs - b.timeMs)
    return lines
}

function findActiveLyricIndex(lines: LyricLine[], positionMs: number): number {
    if (lines.length === 0) {
        return -1
    }
    let active = 0
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].timeMs <= positionMs) {
            active = i
        } else {
            break
        }
    }
    return active
}

export { findActiveLyricIndex, parseLrc }
export type { LyricLine }