/**
 * 搜索历史：localStorage 持久化，最多保留 12 条，同词去重并置顶
 */

const HISTORY_KEY = "musicstorm-search-history"
const MAX_ITEMS = 12

export const SEARCH_HISTORY_EVENT = "musicstorm-search-history-change"

export function getSearchHistory(): string[] {
    if (typeof window === "undefined") {
        return []
    }
    try {
        const raw = window.localStorage.getItem(HISTORY_KEY)
        if (!raw) {
            return []
        }
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
            return []
        }
        return parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, MAX_ITEMS)
    } catch {
        return []
    }
}

function writeHistory(items: string[]): void {
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
    } catch {
        // localStorage 不可用时静默降级
    }
    window.dispatchEvent(new CustomEvent(SEARCH_HISTORY_EVENT))
}

/** 记录一次搜索：非空、去重、置顶、截断 */
export function addSearchHistory(keyword: string): void {
    const clean = keyword.trim()
    if (!clean) {
        return
    }
    const next = [clean, ...getSearchHistory().filter((item) => item !== clean)]
    writeHistory(next.slice(0, MAX_ITEMS))
}

export function removeSearchHistory(keyword: string): void {
    writeHistory(getSearchHistory().filter((item) => item !== keyword))
}

export function clearSearchHistory(): void {
    writeHistory([])
}
