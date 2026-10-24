import { LogIn, LogOut } from "lucide-react"
import { useEffect, useState } from "react"

import { AccountAvatar } from "@/components/bilibili/account-avatar"
import { AuthDialog } from "@/components/bilibili/auth-dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AUTH_EVENT,
    fetchBilibiliAuthStatus,
    logoutBilibili,
    type BilibiliAccount,
} from "@/lib/bilibili/auth"
import { cn } from "@/lib/utils"

type AccountMenuProps = {
    variant: "compact" | "profile"
    side?: "top" | "bottom"
    align?: "start" | "end"
    avatarPixels?: number
    className?: string
}

function AccountMenu({
    variant,
    side = "top",
    align = "start",
    avatarPixels = variant === "compact" ? 24 : 32,
    className,
}: AccountMenuProps) {
    const [ready, setReady] = useState(false)
    const [account, setAccount] = useState<BilibiliAccount | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)

    useEffect(() => {
        let active = true

        function syncAccount() {
            void fetchBilibiliAuthStatus()
                .then((status) => {
                    if (active) setAccount(status.account)
                })
                .catch(() => {
                    if (active) setAccount(null)
                })
                .finally(() => {
                    if (active) setReady(true)
                })
        }

        syncAccount()
        window.addEventListener(AUTH_EVENT, syncAccount)
        return () => {
            active = false
            window.removeEventListener(AUTH_EVENT, syncAccount)
        }
    }, [])

    async function handleLogout() {
        await logoutBilibili()
        setAccount(null)
    }

    const trigger =
        variant === "compact" ? (
            <DropdownMenuTrigger
                aria-label={account ? "B站账号菜单" : "登录B站账号"}
                title={account ? "B站账号" : "登录B站账号"}
                className={cn(
                    "flex cursor-pointer items-center justify-center rounded-full",
                    "transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.95] active:duration-[var(--duration-press)]",
                    "focus-visible:outline-2 focus-visible:outline-ring",
                    className,
                )}
            >
                {!ready ? (
                    <span
                        className="animate-pulse rounded-full bg-[var(--surface-fill)]"
                        style={{
                            width: avatarPixels,
                            height: avatarPixels,
                        }}
                    />
                ) : account ? (
                    <AccountAvatar
                        src={account.avatarUrl}
                        name={account.name}
                        pixels={avatarPixels}
                    />
                ) : (
                    <span
                        className="flex items-center justify-center rounded-full bg-[var(--surface-fill)] text-muted-foreground"
                        style={{
                            width: avatarPixels,
                            height: avatarPixels,
                        }}
                    >
                        <LogIn
                            aria-hidden="true"
                            className="size-3.5"
                        />
                    </span>
                )}
            </DropdownMenuTrigger>
        ) : (
            <DropdownMenuTrigger
                aria-label={account ? "B站账号菜单" : "登录B站账号"}
                title={account ? "B站账号" : "登录B站账号"}
                className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left",
                    "transition-colors hover:bg-[var(--surface-fill)] focus-visible:outline-2 focus-visible:outline-ring",
                    className,
                )}
            >
                {!ready ? (
                    <>
                        <span
                            className="animate-pulse rounded-full bg-[var(--surface-fill)]"
                            style={{
                                width: avatarPixels,
                                height: avatarPixels,
                            }}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <span className="h-3 w-20 animate-pulse rounded bg-[var(--surface-fill)]" />
                            <span className="h-2.5 w-28 animate-pulse rounded bg-[var(--surface-fill)]" />
                        </span>
                    </>
                ) : account ? (
                    <AccountAvatar
                        src={account.avatarUrl}
                        name={account.name}
                        pixels={avatarPixels}
                    />
                ) : (
                    <span
                        className="flex items-center justify-center rounded-full bg-[var(--surface-fill)] text-muted-foreground"
                        style={{
                            width: avatarPixels,
                            height: avatarPixels,
                        }}
                    >
                        <LogIn
                            aria-hidden="true"
                            className="size-4"
                        />
                    </span>
                )}
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                        {account?.name ?? "登录B站账号"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                        {account ? `UID ${account.mid}` : "登录后查看收藏夹"}
                    </span>
                </span>
            </DropdownMenuTrigger>
        )

    return (
        <>
            <DropdownMenu>
                {trigger}
                <DropdownMenuContent
                    side={side}
                    align={align}
                    className="min-w-[180px]"
                >
                    {!ready ? (
                        <DropdownMenuItem disabled>
                            正在读取账号…
                        </DropdownMenuItem>
                    ) : account ? (
                        <>
                            <div className="px-2 py-1.5">
                                <p className="truncate text-[13px] font-medium">
                                    {account.name}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    UID {account.mid}
                                </p>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => void handleLogout()}
                                className="cursor-pointer gap-2"
                            >
                                <LogOut className="size-3.5" />
                                退出
                            </DropdownMenuItem>
                        </>
                    ) : (
                        <DropdownMenuItem
                            onClick={() => setDialogOpen(true)}
                            className="cursor-pointer gap-2"
                        >
                            <LogIn className="size-3.5" />
                            登录
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
    )
}

export { AccountMenu }
