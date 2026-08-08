import {
    applyNeteaseCredentials,
    clearNeteaseSession,
    getCookie,
    isNeteaseLoggedIn,
    snapshotNeteaseCredentials,
    type NeteaseCredentials,
} from "@/lib/netease/auth-cookie"
import type { NeteaseProfile } from "@/lib/netease/user"

const VAULT_KEY = "musicstorm-netease-accounts"
const ACTIVE_KEY = "musicstorm-netease-active-uid"

type NeteaseAccountRecord = {
    userId: number
    nickname: string
    avatarUrl: string
    credentials: NeteaseCredentials
    updatedAt: number
}

type AccountVault = {
    accounts: NeteaseAccountRecord[]
    activeUserId: number | null
}

function emptyVault(): AccountVault {
    return { accounts: [], activeUserId: null }
}

function readVault(): AccountVault {
    if (typeof window === "undefined") {
        return emptyVault()
    }
    try {
        const raw = window.localStorage.getItem(VAULT_KEY)
        if (!raw) {
            return emptyVault()
        }
        const parsed = JSON.parse(raw) as { accounts?: unknown }
        const list = Array.isArray(parsed.accounts) ? parsed.accounts : []
        const accounts: NeteaseAccountRecord[] = list
            .filter(
                (item): item is NeteaseAccountRecord =>
                    item != null &&
                    typeof item === "object" &&
                    typeof (item as NeteaseAccountRecord).userId === "number" &&
                    typeof (item as NeteaseAccountRecord).credentials?.musicU ===
                        "string" &&
                    (item as NeteaseAccountRecord).credentials.musicU.length > 0,
            )
            .map((item) => ({
                userId: item.userId,
                nickname: item.nickname || "网易云用户",
                avatarUrl: item.avatarUrl || "",
                credentials: {
                    musicU: item.credentials.musicU,
                    csrf: item.credentials.csrf ?? null,
                },
                updatedAt:
                    typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
            }))

        const activeRaw = window.localStorage.getItem(ACTIVE_KEY)
        const parsedActive =
            activeRaw && /^\d+$/.test(activeRaw) ? Number(activeRaw) : null
        const activeUserId =
            parsedActive != null && accounts.some((a) => a.userId === parsedActive)
                ? parsedActive
                : null

        return { accounts, activeUserId }
    } catch {
        return emptyVault()
    }
}

function writeVault(vault: AccountVault): void {
    window.localStorage.setItem(
        VAULT_KEY,
        JSON.stringify({ accounts: vault.accounts }),
    )
    if (vault.activeUserId != null) {
        window.localStorage.setItem(ACTIVE_KEY, String(vault.activeUserId))
    } else {
        window.localStorage.removeItem(ACTIVE_KEY)
    }
}

function listNeteaseAccounts(): NeteaseAccountRecord[] {
    return readVault()
        .accounts.slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
}

function getActiveUserId(): number | null {
    return readVault().activeUserId
}

function upsertActiveAccount(profile: NeteaseProfile): void {
    const credentials = snapshotNeteaseCredentials()
    if (!credentials) {
        return
    }

    const vault = readVault()
    const next: NeteaseAccountRecord = {
        userId: profile.userId,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        credentials,
        updatedAt: Date.now(),
    }
    const index = vault.accounts.findIndex((a) => a.userId === profile.userId)
    if (index >= 0) {
        vault.accounts[index] = next
    } else {
        vault.accounts.push(next)
    }
    vault.activeUserId = profile.userId
    writeVault(vault)
}

// 切换账号：若仍登录则先把当前活跃 cookie 回写保险库，再应用目标凭证
function switchNeteaseAccount(userId: number): boolean {
    const vault = readVault()
    const target = vault.accounts.find((a) => a.userId === userId)
    if (!target) {
        return false
    }

    if (isNeteaseLoggedIn() && vault.activeUserId != null) {
        const currentCreds = snapshotNeteaseCredentials()
        if (currentCreds) {
            const currentIdx = vault.accounts.findIndex(
                (a) => a.userId === vault.activeUserId,
            )
            if (currentIdx >= 0) {
                vault.accounts[currentIdx] = {
                    ...vault.accounts[currentIdx],
                    credentials: currentCreds,
                    updatedAt: Date.now(),
                }
            }
        }
    }

    applyNeteaseCredentials(target.credentials)
    vault.activeUserId = userId
    writeVault(vault)
    return true
}

function deactivateNeteaseSession(): void {
    clearNeteaseSession()
    const vault = readVault()
    vault.activeUserId = null
    writeVault(vault)
}

function removeNeteaseAccount(userId: number): void {
    const vault = readVault()
    const removed = vault.accounts.find((a) => a.userId === userId)
    vault.accounts = vault.accounts.filter((a) => a.userId !== userId)

    const musicU = getCookie("MUSIC_U")
    const isActiveMarked = vault.activeUserId === userId
    const isActiveCookie =
        musicU != null &&
        removed != null &&
        removed.credentials.musicU === musicU

    if (isActiveMarked || isActiveCookie) {
        clearNeteaseSession()
        vault.activeUserId = null
    }

    if (
        vault.activeUserId != null &&
        !vault.accounts.some((a) => a.userId === vault.activeUserId)
    ) {
        vault.activeUserId = null
    }

    writeVault(vault)
}

function reconcileNeteaseVaultOnBoot(): void {
    const vault = readVault()
    const musicU = getCookie("MUSIC_U")

    if (musicU) {
        const match = vault.accounts.find((a) => a.credentials.musicU === musicU)
        if (match && vault.activeUserId !== match.userId) {
            vault.activeUserId = match.userId
            writeVault(vault)
        }
        return
    }

    if (vault.activeUserId != null) {
        const active = vault.accounts.find((a) => a.userId === vault.activeUserId)
        if (active) {
            applyNeteaseCredentials(active.credentials)
        }
    }
}

export {
    deactivateNeteaseSession,
    getActiveUserId,
    listNeteaseAccounts,
    reconcileNeteaseVaultOnBoot,
    removeNeteaseAccount,
    switchNeteaseAccount,
    upsertActiveAccount,
}
export type { NeteaseAccountRecord }