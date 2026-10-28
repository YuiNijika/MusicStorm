function formatDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(totalSec / 3600)
    const min = Math.floor((totalSec % 3600) / 60)
    const sec = totalSec % 60
    if (hours > 0) {
        return `${hours}:${min.toString().padStart(2, "0")}:${sec
            .toString()
            .padStart(2, "0")}`
    }
    return `${min}:${sec.toString().padStart(2, "0")}`
}

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
