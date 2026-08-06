import { useEffect } from "react"

import { apiCachePurgeExpired } from "@/lib/netease/api-cache"
import {
    AUTO_PURGE_EVENT,
    TTL_EVENT,
    getApiCacheAutoPurge,
    getApiCachePurgeIntervalMs,
} from "@/lib/netease/cache-prefs"
import { isTauriRuntime } from "@/lib/storage/paths"

/**
 * 按设置定时清理过期 API 缓存，含 DB 与 cache 目录。
 * 启动时立即跑一轮，间隔随 TTL 变化。
 */
function useApiCacheAutoPurge(): void {
    useEffect(() => {
        if (!isTauriRuntime()) {
            return
        }

        let timer: number | null = null
        let firstRun: number | null = null
        let cancelled = false

        function clearTimer() {
            if (timer != null) {
                window.clearInterval(timer)
                timer = null
            }
            if (firstRun != null) {
                window.clearTimeout(firstRun)
                firstRun = null
            }
        }

        function schedule() {
            clearTimer()
            if (!getApiCacheAutoPurge()) {
                return
            }

            const tick = () => {
                if (cancelled || !getApiCacheAutoPurge()) {
                    return
                }
                void apiCachePurgeExpired()
            }

            // 首轮延迟执行，避免与首屏渲染争抢磁盘 I/O
            firstRun = window.setTimeout(() => {
                firstRun = null
                tick()
            }, 3_000)
            timer = window.setInterval(tick, getApiCachePurgeIntervalMs())
        }

        schedule()

        function onPrefs() {
            schedule()
        }

        window.addEventListener(AUTO_PURGE_EVENT, onPrefs)
        window.addEventListener(TTL_EVENT, onPrefs)

        return () => {
            cancelled = true
            clearTimer()
            window.removeEventListener(AUTO_PURGE_EVENT, onPrefs)
            window.removeEventListener(TTL_EVENT, onPrefs)
        }
    }, [])
}

export { useApiCacheAutoPurge }