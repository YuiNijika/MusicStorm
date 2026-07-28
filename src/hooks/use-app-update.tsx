/**
 * 应用更新状态：启动静默检测 + 手动刷新
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react"

import {
    checkAppUpdate,
    peekCachedUpdate,
    subscribeUpdateStatus,
    type UpdateCheckResult,
} from "@/lib/app/github-update"
import { notifyInfo } from "@/lib/notify"

const BOOT_TOAST_KEY = "musicstorm-update-boot-toasted"
const BOOT_TOAST_ID = "app-update-available"

type AppUpdateContextValue = {
    status: UpdateCheckResult | null
    checking: boolean
    /** 静默或手动；force 时绕过 5h 缓存 */
    refresh: (force?: boolean) => Promise<UpdateCheckResult>
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

function AppUpdateProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<UpdateCheckResult | null>(() =>
        peekCachedUpdate(),
    )
    const [checking, setChecking] = useState(false)

    const refresh = useCallback(async (force = false) => {
        setChecking(true)
        try {
            const result = await checkAppUpdate(force)
            setStatus(result)
            return result
        } finally {
            setChecking(false)
        }
    }, [])

    useEffect(() => {
        return subscribeUpdateStatus((result) => {
            setStatus(result)
        })
    }, [])

    // 启动：用缓存先画 NEW，再后台检测（未过期则几乎不发网）
    useEffect(() => {
        let cancelled = false
        const timer = window.setTimeout(() => {
            void (async () => {
                const result = await checkAppUpdate(false)
                if (cancelled) {
                    return
                }
                setStatus(result)
                if (!result.hasUpdate) {
                    return
                }
                // 每个浏览器会话最多 toast 一次
                try {
                    if (sessionStorage.getItem(BOOT_TOAST_KEY) === "1") {
                        return
                    }
                    sessionStorage.setItem(BOOT_TOAST_KEY, "1")
                } catch {
                    // private mode
                }
                notifyInfo("发现新版本", {
                    id: BOOT_TOAST_ID,
                    description: `${result.currentVersion} → ${result.latestVersion}`,
                    timeout: 5200,
                })
            })()
        }, 1800)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [])

    const value = useMemo<AppUpdateContextValue>(
        () => ({ status, checking, refresh }),
        [status, checking, refresh],
    )

    return (
        <AppUpdateContext.Provider value={value}>
            {children}
        </AppUpdateContext.Provider>
    )
}

function useAppUpdate(): AppUpdateContextValue {
    const ctx = useContext(AppUpdateContext)
    if (!ctx) {
        throw new Error("useAppUpdate must be used within AppUpdateProvider")
    }
    return ctx
}

export { AppUpdateProvider, useAppUpdate }