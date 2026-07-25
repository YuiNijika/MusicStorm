/** 毫秒 → m:ss */
function formatDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, "0")}`
}

export { formatDuration }