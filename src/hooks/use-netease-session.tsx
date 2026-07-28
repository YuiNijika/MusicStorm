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
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notify"

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

const NeteaseSessionContext = createContext<SessionContextValue | null>(null)

function NeteaseSessionProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SessionState>(initial)

    const refresh = useCallback(async () => {
        const accounts = listNeteaseAccounts()
        const activeUserId = getActiveUserId()

        if (!isNeteaseLoggedIn()) {
            setState({
                ready: true,
                loggedIn: false,
                profile: null,
                error: null,
                accounts,
                activeUserId: null,
            })
            return null
        }

        try {
            const profile = await fetchUserAccount()
            if (!profile) {
                setState({
                    ready: true,
                    loggedIn: false,
                    profile: null,
                    error: null,
                    accounts,
                    activeUserId,
                })
                return null
            }

            upsertActiveAccount(profile)
            setState({
                ready: true,
                loggedIn: true,
                profile,
                error: null,
                accounts: listNeteaseAccounts(),
                activeUserId: profile.userId,
            })
            return profile
        } catch {
            setState({
                ready: true,
                loggedIn: isNeteaseLoggedIn(),
                profile: null,
                error: "无法获取账号信息",
                accounts: listNeteaseAccounts(),
                activeUserId: getActiveUserId(),
            })
            return null
        }
    }, [])

    const logout = useCallback(() => {
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

            // 凭证已写入，但资料拉取失败：仍算切换成功，提示可重试
            if (isNeteaseLoggedIn()) {
                notifyWarning("已切换账号", {
                    id: "netease-switch-account",
                    description: `${label} · 资料暂未刷新`,
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