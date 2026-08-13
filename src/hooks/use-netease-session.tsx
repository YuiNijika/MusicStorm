import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react"

import {
    deactivateNeteaseSession,
    getActiveUserId,
    listNeteaseAccounts,
    reconcileNeteaseVaultOnBoot,
    removeNeteaseAccount as vaultRemoveAccount,
    switchNeteaseAccount as vaultSwitchAccount,
    upsertActiveAccount,
    type NeteaseAccountRecord,
} from "@/lib/netease/account-vault"
import {
    clearNeteaseSession,
    isNeteaseLoggedIn,
} from "@/lib/netease/auth-cookie"
import {
    fetchUserAccount,
    type NeteaseProfile,
} from "@/lib/netease/user"
import { notifyError, notifySuccess } from "@/lib/notify"

type SessionState = {
    ready: boolean
    loggedIn: boolean
    profile: NeteaseProfile | null
    error: string | null
    accounts: NeteaseAccountRecord[]
    activeUserId: number | null
}

type SessionContextValue = SessionState & {
    refresh: () => Promise<NeteaseProfile | null>
    logout: () => void
    switchAccount: (userId: number) => Promise<boolean>
    removeAccount: (userId: number) => Promise<void>
}

const initial: SessionState = {
    ready: false,
    loggedIn: false,
    profile: null,
    error: null,
    accounts: [],
    activeUserId: null,
}

function isSessionExpiredError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return (
        /code\D*(301|302)\b/.test(message) ||
        /HTTP\s*401\b/.test(message) ||
        /(需要登录|login required|not logged in)/i.test(message)
    )
}

const NeteaseSessionContext = createContext<SessionContextValue | null>(null)

function NeteaseSessionProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SessionState>(initial)
    // 竞态保护：dev HMR / 手动刷新会触发并发 refresh，旧响应不得覆盖新响应
    const refreshSeqRef = useRef(0)
    const retryRef = useRef<number | null>(null)
    const stateRef = useRef(state)
    stateRef.current = state

    const refresh = useCallback(async () => {
        const seq = ++refreshSeqRef.current
        const commit = (next: SessionState) => {
            if (seq !== refreshSeqRef.current) {
                return
            }
            setState(next)
        }
        const accounts = listNeteaseAccounts()
        const activeUserId = getActiveUserId()

        if (!isNeteaseLoggedIn()) {
            commit({
                ready: true,
                loggedIn: false,
                profile: null,
                error: null,
                accounts,
                activeUserId: null,
            })
            return null
        }

        // API 抖动（网络/风控/外部源异常）时保留登录态，45s 后自动重试一次
        const scheduleRetry = () => {
            if (retryRef.current != null) {
                return
            }
            retryRef.current = window.setTimeout(() => {
                retryRef.current = null
                if (isNeteaseLoggedIn()) {
                    void refresh()
                }
            }, 45_000)
        }

        try {
            const profile = await fetchUserAccount()
            if (!profile) {
                // 请求成功但拿不到资料（网易云风控/新接口行为/外部源格式差异）：
                // 先用 vault 缓存资料兜底显示，45s 后自动重试补拉；
                // cookie 还在就不杀登录态，避免误判导致喜欢列表等本地数据被清空
                const cached = activeUserId != null
                    ? listNeteaseAccounts().find((a) => a.userId === activeUserId)
                    : null
                commit({
                    ready: true,
                    loggedIn: isNeteaseLoggedIn(),
                    profile: cached
                        ? {
                              userId: cached.userId,
                              nickname: cached.nickname,
                              avatarUrl: cached.avatarUrl,
                              vipType: stateRef.current.profile?.vipType ?? 0,
                          }
                        : stateRef.current.profile,
                    error: cached ? "资料未刷新，稍后自动重试" : "账号资料暂不可用",
                    accounts,
                    activeUserId,
                })
                scheduleRetry()
                return null
            }

            upsertActiveAccount(profile)
            commit({
                ready: true,
                loggedIn: true,
                profile,
                error: null,
                accounts: listNeteaseAccounts(),
                activeUserId: profile.userId,
            })
            return profile
        } catch (error) {
            if (isSessionExpiredError(error)) {
                // 网易云明确返回「需要登录」：清掉失效凭证，避免僵死登录态
                clearNeteaseSession()
                commit({
                    ready: true,
                    loggedIn: false,
                    profile: null,
                    error: null,
                    accounts: listNeteaseAccounts(),
                    activeUserId: null,
                })
                return null
            }
            commit({
                ready: true,
                loggedIn: isNeteaseLoggedIn(),
                profile: (() => {
                    const cached =
                        activeUserId != null
                            ? listNeteaseAccounts().find(
                                  (a) => a.userId === activeUserId,
                              )
                            : null
                    return cached
                        ? {
                              userId: cached.userId,
                              nickname: cached.nickname,
                              avatarUrl: cached.avatarUrl,
                              vipType: stateRef.current.profile?.vipType ?? 0,
                          }
                        : stateRef.current.profile
                })(),
                error: "无法获取账号信息",
                accounts: listNeteaseAccounts(),
                activeUserId: getActiveUserId(),
            })
            scheduleRetry()
            return null
        }
    }, [])

    const logout = useCallback(() => {
        if (retryRef.current != null) {
            window.clearTimeout(retryRef.current)
            retryRef.current = null
        }
        refreshSeqRef.current += 1 // 使进行中的 refresh 失效
        deactivateNeteaseSession()
        setState({
            ready: true,
            loggedIn: false,
            profile: null,
            error: null,
            accounts: listNeteaseAccounts(),
            activeUserId: null,
        })
    }, [])

    const switchAccount = useCallback(
        async (userId: number) => {
            const snapshot = listNeteaseAccounts().find(
                (item) => item.userId === userId,
            )
            const label = snapshot?.nickname?.trim() || `uid ${userId}`

            const ok = vaultSwitchAccount(userId)
            if (!ok) {
                notifyError("切换失败", {
                    id: "netease-switch-account",
                    description: "未找到该账号或本地凭证已失效",
                })
                return false
            }

            const profile = await refresh()
            if (profile) {
                notifySuccess("已切换账号", {
                    id: "netease-switch-account",
                    description: profile.nickname || label,
                })
                return true
            }

            // 凭证已写入，但资料拉取失败：先按切换成功提示（vault 缓存资料已在
            // refresh 中兜底显示），45s 后自动重试补拉，不误报失败
            if (isNeteaseLoggedIn()) {
                notifySuccess("已切换账号", {
                    id: "netease-switch-account",
                    description: label,
                })
                return true
            }

            notifyError("切换失败", {
                id: "netease-switch-account",
                description: "凭证无效，请重新登录该账号",
            })
            return false
        },
        [refresh],
    )

    const removeAccount = useCallback(
        async (userId: number) => {
            // React 态 + vault 标记都算「当前」，避免一边登出一边 cookie 残留
            const wasCurrent =
                state.activeUserId === userId ||
                state.profile?.userId === userId ||
                getActiveUserId() === userId

            vaultRemoveAccount(userId)

            if (wasCurrent) {
                // vault 已尽量清 cookie；再强制一次，覆盖凭证漂移
                clearNeteaseSession()
                setState({
                    ready: true,
                    loggedIn: false,
                    profile: null,
                    error: null,
                    accounts: listNeteaseAccounts(),
                    activeUserId: null,
                })
                return
            }

            if (!isNeteaseLoggedIn()) {
                setState({
                    ready: true,
                    loggedIn: false,
                    profile: null,
                    error: null,
                    accounts: listNeteaseAccounts(),
                    activeUserId: getActiveUserId(),
                })
                return
            }

            await refresh()
        },
        [refresh, state.activeUserId, state.profile?.userId],
    )

    useEffect(() => {
        reconcileNeteaseVaultOnBoot()
        void refresh()
        return () => {
            refreshSeqRef.current += 1
            if (retryRef.current != null) {
                window.clearTimeout(retryRef.current)
                retryRef.current = null
            }
        }
    }, [refresh])

    const value = useMemo<SessionContextValue>(
        () => ({
            ...state,
            refresh,
            logout,
            switchAccount,
            removeAccount,
        }),
        [state, refresh, logout, switchAccount, removeAccount],
    )

    return (
        <NeteaseSessionContext.Provider value={value}>
            {children}
        </NeteaseSessionContext.Provider>
    )
}

function useNeteaseSession(): SessionContextValue {
    const ctx = useContext(NeteaseSessionContext)
    if (!ctx) {
        throw new Error("useNeteaseSession must be used within NeteaseSessionProvider")
    }
    return ctx
}

export { NeteaseSessionProvider, useNeteaseSession }