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

/**
 * 无时间轴的内嵌/纯文本歌词 → 逐行展示。
 * 全部 timeMs=0，不跟进度高亮跳转。
 */
function plainTextToLyricLines(text: string): LyricLine[] {
    const lines: LyricLine[] = []
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) {
            continue
        }
        // 跳过常见 LRC 元信息行
        if (/^\[(ti|ar|al|by|offset|re|ve):/i.test(line)) {
            continue
        }
        // 去掉残留时间戳前缀
        const textOnly = line.replace(/^(\[[\d:.]+\])+/, "").trim() || line
        if (textOnly) {
            lines.push({ timeMs: 0, text: textOnly })
        }
    }
    return lines
}

/** LRC 优先；失败则纯文本 */
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
    // 全为 0 的纯文本：不高亮某一行
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