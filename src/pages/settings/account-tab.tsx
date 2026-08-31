import { useEffect, useState } from "react"

import { useNeteaseSession } from "@/hooks/use-netease-session"
import {
    formatError,
    notifyInfo,
    notifyPromise,
} from "@/lib/notify"
import {
    SIGNIN_LOG_EVENT,
    performDailySignin,
    readAutoSigninEnabled,
    readSigninEntry,
    setAutoSigninEnabled,
    type SigninLogEntry,
} from "@/lib/netease/daily-signin"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import { resolveVipTier } from "@/lib/netease/user"
import {
    ActionButton,
    SettingsGroup,
    SwitchRow,
    TabHeader,
} from "@/pages/settings/settings-ui"

function formatSigninTime(ts: number): string {
    const date = new Date(ts)
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function AccountTab({ onLogin }: { onLogin: () => void }) {
    const {
        ready,
        loggedIn,
        profile,
        accounts,
        activeUserId,
        logout,
        switchAccount,
        removeAccount,
    } = useNeteaseSession()
    const [busyId, setBusyId] = useState<number | null>(null)
    const [signinBusy, setSigninBusy] = useState(false)
    const [signinEntry, setSigninEntry] = useState<SigninLogEntry | null>(null)
    const [autoSignin, setAutoSigninState] = useState(() =>
        readAutoSigninEnabled(),
    )

    // 签到记录跟随当前账号，自动/手动签到后经事件广播刷新
    useEffect(() => {
        function sync() {
            setSigninEntry(
                loggedIn && activeUserId != null
                    ? readSigninEntry(activeUserId)
                    : null,
            )
        }
        sync()
        window.addEventListener(SIGNIN_LOG_EVENT, sync)
        return () => {
            window.removeEventListener(SIGNIN_LOG_EVENT, sync)
        }
    }, [loggedIn, activeUserId])

    async function handleSignin() {
        if (signinBusy || activeUserId == null) {
            return
        }
        setSigninBusy(true)
        try {
            // Promise 状态 toast：签到中 → 成功/已签/未完成就地变换
            await notifyPromise(performDailySignin(activeUserId), {
                loading: "签到中…",
                success: (entry) => ({
                    title:
                        entry.state === "failed"
                            ? "签到未完成"
                            : entry.state === "already"
                              ? "今日已签到"
                              : "签到完成",
                    description: entry.message,
                }),
                error: (error) => ({
                    title: "签到失败",
                    description: formatError(error),
                }),
            })
        } catch {
            // 终态已由 promise toast 呈现
        } finally {
            setSigninBusy(false)
        }
    }

    async function handleSwitch(userId: number) {
        if (userId === activeUserId && loggedIn) {
            const name =
                accounts.find((item) => item.userId === userId)?.nickname?.trim() ||
                profile?.nickname ||
                `uid ${userId}`
            notifyInfo("已是当前账号", {
                id: "netease-switch-account",
                description: name,
            })
            return
        }
        setBusyId(userId)
        try {
            await switchAccount(userId)
        } finally {
            setBusyId(null)
        }
    }

    async function handleRemove(userId: number) {
        setBusyId(userId)
        try {
            await removeAccount(userId)
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="space-y-3">
            <TabHeader
                title="账号"
                description="登录网易云，支持多账号切换与每日签到"
            />

            <div className="space-y-3">
                <SettingsGroup
                    title="当前账号"
                    description="签到与退出只影响当前登录的账号"
                >
                    {!ready ? (
                        <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-fill)]" />
                    ) : loggedIn && profile ? (
                        <div className="flex min-h-11 flex-wrap items-center gap-3">
                            {profile.avatarUrl ? (
                                <img
                                    src={profile.avatarUrl}
                                    alt=""
                                    className="size-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex size-12 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[14px] font-medium">
                                    {profile.nickname.slice(0, 1)}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
                                    {profile.nickname}
                                </p>
                                <p className="text-[13px] text-muted-foreground">
                                    {resolveVipTier(profile)} · uid{" "}
                                    {profile.userId}
                                </p>
                            </div>
                            <ActionButton
                                disabled={signinBusy}
                                onClick={() => void handleSignin()}
                            >
                                {signinBusy ? "签到中…" : "每日签到"}
                            </ActionButton>
                            <ActionButton onClick={logout}>退出当前</ActionButton>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            当前未登录。可登录新账号，或从下方已保存列表切换。
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <ActionButton variant="primary" onClick={onLogin}>
                            {loggedIn ? "添加账号" : "登录"}
                        </ActionButton>
                        <ActionButton onClick={() => void openNeteaseRegister()}>
                            注册（官网）
                        </ActionButton>
                    </div>
                </SettingsGroup>

                <SettingsGroup
                    title="每日签到"
                    description="自动签到跟随登录态，只作用于当前账号"
                >
                    {loggedIn && signinEntry ? (
                        <p className="text-sm text-muted-foreground">
                            {signinEntry.day ===
                            new Date().toLocaleDateString("sv")
                                ? signinEntry.ok
                                    ? `今日已签到 · ${signinEntry.message}`
                                    : `今日签到未完成 · ${signinEntry.message}`
                                : `上次签到记录 ${formatSigninTime(signinEntry.at)}`}
                        </p>
                    ) : null}
                    <SwitchRow
                        title="自动签到"
                        description="打开应用或跨零点后自动执行，未签到则补签"
                        checked={autoSignin}
                        onCheckedChange={(checked) => {
                            setAutoSigninEnabled(checked)
                            setAutoSigninState(checked)
                        }}
                    />
                </SettingsGroup>

                {accounts.length > 0 ? (
                    <SettingsGroup
                        title="已保存账号"
                        description="点击切换；移除只删本地凭证"
                    >
                        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                            {accounts.map((account) => {
                                const isActive =
                                    loggedIn && activeUserId === account.userId
                                const busy = busyId === account.userId
                                return (
                                    <li
                                        key={account.userId}
                                        className="flex min-h-11 flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1"
                                    >
                                        {account.avatarUrl ? (
                                            <img
                                                src={account.avatarUrl}
                                                alt=""
                                                className="size-9 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[13px] font-medium">
                                                {account.nickname.slice(0, 1)}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {account.nickname}
                                                {isActive ? (
                                                    <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                                                        使用中
                                                    </span>
                                                ) : null}
                                            </p>
                                            <p className="text-[13px] text-muted-foreground">
                                                uid {account.userId}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                disabled={busy || isActive}
                                                onClick={() =>
                                                    void handleSwitch(
                                                        account.userId,
                                                    )
                                                }
                                                className="h-8 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[13px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] disabled:cursor-default disabled:opacity-40 active:scale-[0.97] active:duration-[var(--duration-press)]"
                                            >
                                                {busy && !isActive
                                                    ? "切换中"
                                                    : isActive
                                                      ? "当前"
                                                      : "切换"}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void handleRemove(
                                                        account.userId,
                                                    )
                                                }
                                                className="h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-300"
                                            >
                                                移除
                                            </button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </SettingsGroup>
                ) : null}
            </div>
        </div>
    )
}

export { AccountTab }
