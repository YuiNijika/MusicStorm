/**
 * 网易云多账号保险库
 * - 活跃 cookie 仍走 auth-cookie（API 请求）
 * - 本模块只负责多账号快照与切换
 */

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

/** 将当前 cookie + 资料写入保险库并标为活跃（不派发事件，由调用方 setState） */
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

/**
 * 切换到已保存账号。
 * 先把当前活跃 cookie 回写保险库（若仍登录），再应用目标凭证。
 */
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

/** 仅清当前 cookie，账号仍留在列表（可再切换） */
function deactivateNeteaseSession(): void {
    clearNeteaseSession()
    const vault = readVault()
    vault.activeUserId = null
    writeVault(vault)
}

/** 从保险库移除；若是当前账号则同时清 cookie */
function removeNeteaseAccount(userId: number): void {
    const vault = readVault()
    vault.accounts = vault.accounts.filter((a) => a.userId !== userId)
    if (vault.activeUserId === userId) {
        clearNeteaseSession()
        vault.activeUserId = null
    }
    writeVault(vault)
}

/**
 * 启动时：若有 cookie 但 vault 无 active，尽量对齐；
 * 若 vault 有 active 但 cookie 空，恢复 active 凭证。
 */
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