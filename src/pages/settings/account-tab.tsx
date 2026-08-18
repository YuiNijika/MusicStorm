import { useState } from "react"

import { Section } from "@/components/music/section"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { notifyFromError, notifyInfo, notifySuccess } from "@/lib/notify"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import { dailySignin, resolveVipTier } from "@/lib/netease/user"
import { SettingsGroup } from "@/pages/settings/settings-ui"

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

    async function handleSignin() {
        if (signinBusy) {
            return
        }
        setSigninBusy(true)
        try {
            const [android, web] = await Promise.all([
                dailySignin(0),
                dailySignin(1),
            ])
            if (android.ok || web.ok) {
                notifySuccess("签到成功", {
                    description: [android.message, web.message]
                        .filter(Boolean)
                        .join(" · "),
                })
            } else {
                notifyInfo("签到", {
                    description: web.message || android.message,
                })
            }
        } catch (err) {
            notifyFromError("签到失败", err)
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
        <Section title="账号" description="多账号登录，设置内手动切换">
            <div className="space-y-3">
                <SettingsGroup>
                    {!ready ? (
                        <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-fill)]" />
                    ) : loggedIn && profile ? (
                        <div className="flex flex-wrap items-center gap-3">
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
                                <p className="text-[12px] text-muted-foreground">
                                    当前使用 · {resolveVipTier(profile)} · uid{" "}
                                    {profile.userId}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={signinBusy}
                                onClick={() => void handleSignin()}
                                className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
                            >
                                {signinBusy ? "签到中…" : "每日签到"}
                            </button>
                            <button
                                type="button"
                                onClick={logout}
                                className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                            >
                                退出当前
                            </button>
                        </div>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">
                            当前未登录。可登录新账号，或从下方已保存列表切换。
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onLogin}
                            className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background active:scale-[0.97]"
                        >
                            {loggedIn ? "添加账号" : "登录"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void openNeteaseRegister()}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                        >
                            注册（官网）
                        </button>
                    </div>
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
                                        className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1"
                                    >
                                        {account.avatarUrl ? (
                                            <img
                                                src={account.avatarUrl}
                                                alt=""
                                                className="size-9 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[12px] font-medium">
                                                {account.nickname.slice(0, 1)}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium">
                                                {account.nickname}
                                                {isActive ? (
                                                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                                        使用中
                                                    </span>
                                                ) : null}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
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
                                                className="h-8 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[11px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] disabled:cursor-default disabled:opacity-40 active:scale-[0.97] active:duration-[var(--duration-press)]"
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
                                                className="h-8 cursor-pointer rounded-full px-3 text-[11px] font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-300"
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
        </Section>
    )
}

export { AccountTab }
