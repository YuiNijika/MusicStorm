type LyricLine = {
    timeMs: number
    text: string
    translation?: string
}

const LINE_RE = /^((?:\[[\d:.]+\])+)(\[[+-]\d+])?(.+)$/
const TIME_RE = /\[(\d+):(\d+)(?:[.:](\d+))?]/g
const GLOBAL_OFFSET_RE = /^\[offset:([+-]?\d+)]/i
const WORD_TIME_RE = /<\d+:\d+(?:[.:]\d+)?>/g

function parseLrc(lrc: string): LyricLine[] {
    const lines: LyricLine[] = []
    if (!lrc.trim()) {
        return lines
    }

    let globalOffsetMs = 0
    const body: string[] = []
    for (const raw of lrc.split(/\r?\n/)) {
        const match = raw.trim().match(GLOBAL_OFFSET_RE)
        if (match) {
            // 全局偏移：正值推迟、负值提前，作用于所有行
            globalOffsetMs = Number(match[1])
        } else {
            body.push(raw)
        }
    }

    for (const raw of body) {
        const match = raw.trim().match(LINE_RE)
        if (!match) {
            continue
        }
        const stamps = match[1]
        const adjustRaw = match[2]
        let text = (match[3] ?? "").trim()
        if (!text) {
            continue
        }
        // 增强型 LRC 的逐字标签对整行同步无用，剥掉防串进歌词文本
        text = text.replace(WORD_TIME_RE, "").trim()
        if (!text) {
            continue
        }

        let adjustMs = 0
        if (adjustRaw) {
            // 行内 [±N] 微调：仅本行生效
            adjustMs = Number(adjustRaw.slice(1, -1))
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
            lines.push({ timeMs: timeMs + globalOffsetMs + adjustMs, text })
        }
    }

    lines.sort((a, b) => a.timeMs - b.timeMs)
    return lines
}

function plainTextToLyricLines(text: string): LyricLine[] {
    const lines: LyricLine[] = []
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) {
            continue
        }
        if (/^\[(ti|ar|al|by|offset|re|ve):/i.test(line)) {
            continue
        }
        const textOnly = line.replace(/^(\[[\d:.]+\])+/, "").trim() || line
        if (textOnly) {
            lines.push({ timeMs: 0, text: textOnly })
        }
    }
    return lines
}

// LRC 优先；失败则纯文本
function parseLyricText(text: string): LyricLine[] {
    const timed = parseLrc(text)
    if (timed.length > 0) {
        return timed
    }
    return plainTextToLyricLines(text)
}

function findActiveLyricIndex(lines: LyricLine[], positionMs: number): number {
    if (lines.length === 0) {
        return -1
    }
    if (lines.every((line) => line.timeMs === 0)) {
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

export { findActiveLyricIndex, parseLrc, parseLyricText, plainTextToLyricLines }
export type { LyricLine }