/** 毫秒 → m:ss */
function formatDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, "0")}`
}

/** 听歌总时长，适合统计大数字 */
function formatListenDuration(ms: number): string {
    const totalMin = Math.max(0, Math.floor(ms / 60_000))
    if (totalMin < 60) {
        return `${totalMin} 分钟`
    }
    const hours = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    if (mins === 0) {
        return `${hours} 小时`
    }
    return `${hours} 小时 ${mins} 分`
}

export { formatDuration, formatListenDuration }