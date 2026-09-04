import { dailySignin } from "@/lib/netease/user"

const AUTO_KEY = "musicstorm-auto-signin"
const LOG_KEY = "musicstorm-signin-log"
const SIGNIN_LOG_EVENT = "musicstorm-signin-log"

type SigninLogEntry = {
    /** 记录所属的自然日（本地时区 YYYY-MM-DD） */
    day: string
    /** 记录时间戳（ms），仅在真实签到成功时落盘 */
    at: number
    /** 是否有效签到（success） */
    ok: boolean
    /** 本次执行的结果状态 */
    state?: "success" | "already" | "failed"
    /** 汇总消息（渠道结果） */
    message: string
}

type SigninLog = Record<string, SigninLogEntry>

function readAutoSigninEnabled(): boolean {
    try {
        const raw = window.localStorage.getItem(AUTO_KEY)
        return raw === null ? true : raw === "1"
    } catch {
        return true
    }
}

function setAutoSigninEnabled(enabled: boolean): void {
    window.localStorage.setItem(AUTO_KEY, enabled ? "1" : "0")
}

function readSigninLog(): SigninLog {
    try {
        const raw = window.localStorage.getItem(LOG_KEY)
        return raw ? (JSON.parse(raw) as SigninLog) : {}
    } catch {
        return {}
    }
}

function readSigninEntry(userId: number): SigninLogEntry | null {
    return readSigninLog()[String(userId)] ?? null
}

function writeSigninEntry(userId: number, entry: SigninLogEntry): void {
    const log = readSigninLog()
    log[String(userId)] = entry
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log))
    // 广播让账号页签到状态即时刷新
    window.dispatchEvent(new Event(SIGNIN_LOG_EVENT))
}

function dayKey(ts: number): string {
    const date = new Date(ts)
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

let signinInFlight: Promise<SigninLogEntry> | null = null

// 会话内「已签」去重：403/已签按用户规则不落盘，但也不能每分钟自动任务都去撞 403，
// 会话内存记一天（重启后重新尝试一次，仍已签则继续静默）
const sessionAlreadyDays = new Set<string>()

/**
 * 执行一次签到：先查状态，再补签缺失渠道。
 * 落盘规则——只有真实签到成功（success）才记录时间戳，过了零点自动执行会再次触发；
 * already（含外部源对重复签到的 403 回应）与 failed 都不落盘，失败可重试。
 */
async function performDailySignin(userId: number): Promise<SigninLogEntry> {
    if (signinInFlight) {
        return signinInFlight
    }

    const run = async (): Promise<SigninLogEntry> => {
        const day = dayKey(Date.now())
        const prev = readSigninEntry(userId)
        if (prev?.day === day && prev.ok) {
            return prev
        }
        if (sessionAlreadyDays.has(`${userId}:${day}`)) {
            return {
                day,
                at: Date.now(),
                ok: false,
                state: "already",
                message: "今日已签到",
            }
        }

        // 对齐内置 API：直接双端签到并解释回执（success/already/failed）。
        // 不依赖签到状态接口 —— server-api 无 dailySummary，内置 API 才可能有；
        // 重复签到按 already 幂等处理，无需事前查状态。
        const parts: string[] = []
        let success = false
        let already = true
        let failed = false
        try {
            const pc = await dailySignin(1)
            parts.push(`网页端：${pc.message}`)
            if (pc.outcome === "success") {
                success = true
                already = false
            } else if (pc.outcome === "failed") {
                failed = true
                already = false
            }
            const mobile = await dailySignin(0)
            parts.push(`安卓端：${mobile.message}`)
            if (mobile.outcome === "success") {
                success = true
                already = false
            } else if (mobile.outcome === "failed") {
                failed = true
                already = false
            }
        } catch (error) {
            failed = true
            parts.push(
                error instanceof Error ? error.message : "签到请求失败",
            )
        }

        const message =
            parts.length > 0
                ? parts.join(" · ")
                : "今日已签到（状态查询确认）"

        // 真实签到成功：记录时间戳，当天后续触发短路，次日零点后自动再签
        if (success) {
            const entry: SigninLogEntry = {
                day,
                at: Date.now(),
                ok: true,
                state: "success",
                message,
            }
            writeSigninEntry(userId, entry)
            return entry
        }

        // 已签（含 403 幂等回应）与失败都不落盘；已签在会话内去重防刷
        const state: "already" | "failed" =
            !failed && already ? "already" : "failed"
        if (state === "already") {
            sessionAlreadyDays.add(`${userId}:${day}`)
        }
        return { day, at: Date.now(), ok: false, state, message }
    }

    signinInFlight = run().finally(() => {
        signinInFlight = null
    })
    return signinInFlight
}

/**
 * 自动签到入口：开关关闭时不动作；当天已有成功记录则短路（不发任何请求）。
 * 时间戳为空、跨天（昨天的记录到今天零点后）都会触发执行。
 */
async function maybeAutoSignin(userId: number): Promise<void> {
    if (!readAutoSigninEnabled()) {
        return
    }
    const prev = readSigninEntry(userId)
    const today = dayKey(Date.now())
    // 只有成功落盘的记录才去重；already/failed 不落盘自然可重试
    if (prev?.day === today && prev.ok) {
        return
    }
    void performDailySignin(userId)
}

export {
    AUTO_KEY,
    SIGNIN_LOG_EVENT,
    maybeAutoSignin,
    performDailySignin,
    readAutoSigninEnabled,
    readSigninEntry,
    setAutoSigninEnabled,
}
export type { SigninLogEntry }
