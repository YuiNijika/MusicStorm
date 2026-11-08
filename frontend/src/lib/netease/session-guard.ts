// 网易云登录态守护。
// 试听场景与收藏类接口两类失效都收敛到这里：清失效凭证并广播重新登录。
// 关键洞察是 user 资料接口在凭证快要失效时仍返回 200，而收藏接口才缓存不住
// 直接回 -462 或 301，所以必须以隐私接口的错误作登录态判据而不是只信资料接口。

import {
    clearNeteaseSession,
    isNeteaseLoggedIn,
} from "@/lib/netease/auth-cookie"
import { fetchUserAccount } from "@/lib/netease/user"
import { notifyError } from "@/lib/notify"

export const NETEASE_LOGIN_REQUIRED_EVENT = "musicstorm:login-required"

// 需要登录的业务码与文案，任一命中即视为登录态失效
const NEED_LOGIN_CODES = new Set([-462, -460, 301, 302, 401])
const NEED_LOGIN_TEXT =
    /(需要登录|login required|not logged in|登录已失效|账号未登录)/i

// 广播节流：同一次会话内避免多个收藏接口同时失败连弹
const BROADCAST_COOLDOWN_MS = 30_000

let lastBroadcastAt = 0
let checkInFlight: Promise<void> | null = null

function isExpiredError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return (
        /code\D*(301|302)\b/.test(message) ||
        /HTTP\s*401\b/.test(message) ||
        NEED_LOGIN_TEXT.test(message)
    )
}

/** 进入失效处理路径时调用。游客失效不值得弹窗，仅清掉本地遗留凭证。 */
function broadcastLoginRequired(): void {
    const now = Date.now()
    if (now - lastBroadcastAt < BROADCAST_COOLDOWN_MS) {
        clearNeteaseSession()
        return
    }
    lastBroadcastAt = now
    clearNeteaseSession()
    window.dispatchEvent(new CustomEvent(NETEASE_LOGIN_REQUIRED_EVENT))
    notifyError("登录已失效，请重新登录", {
        id: NETEASE_LOGIN_REQUIRED_EVENT,
        description: "账号鉴权未通过，已恢复游客模式；重新登录后可完整使用收藏与统计",
    })
}

/** 统一的登录失效入口，只对本地认为已登录的会话生效。 */
export function handleLoginFailure(): void {
    if (!isNeteaseLoggedIn()) {
        clearNeteaseSession()
        return
    }
    broadcastLoginRequired()
}

/** 从一次接口响应的业务码和文案判定是否需要登录。 */
export function isNeedLoginBody(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") {
        return false
    }
    const body = payload as {
        code?: number
        msg?: string
        message?: string
    }
    if (body.code != null && NEED_LOGIN_CODES.has(body.code)) {
        return true
    }
    const text = `${body.msg ?? ""} ${body.message ?? ""}`
    return NEED_LOGIN_TEXT.test(text)
}

/** 拿到试听片段且本地已登录时核对真实登录态，确认失效则走失效处理。 */
export async function guardNetEaseSession(): Promise<void> {
    if (!isNeteaseLoggedIn()) {
        return
    }
    if (checkInFlight) {
        await checkInFlight
        return
    }
    checkInFlight = (async () => {
        let expired = false
        try {
            const profile = await fetchUserAccount()
            if (!profile) {
                return
            }
        } catch (error) {
            expired = isExpiredError(error)
        }
        if (expired) {
            handleLoginFailure()
        }
    })().finally(() => {
        checkInFlight = null
    })
    await checkInFlight
}

export { isExpiredError }