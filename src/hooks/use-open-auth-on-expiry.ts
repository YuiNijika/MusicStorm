import { useEffect, useRef } from "react"

import { NETEASE_LOGIN_REQUIRED_EVENT } from "@/lib/netease/session-guard"

// 失效但未重新登录的会话会持续触发失败接口，若每次都弹会变成骚扰，
// 自动打开一次后冷却一段时间，避免关了立刻又弹
const REOPEN_COOLDOWN_MS = 5 * 60_000

let lastAutoOpenAt = 0

/**
 * 登录失效时自动打开网易云登录对话框。
 * 在管理 authOpen 的组件（侧栏/移动导航/设置）里调用。
 * 内部用 ref 保存最新回调只订阅一次，并做防重复打开冷却。
 */
function useOpenAuthOnExpiry(onNeedLogin: () => void): void {
    const handlerRef = useRef(onNeedLogin)
    handlerRef.current = onNeedLogin

    useEffect(() => {
        const handle = () => {
            const now = Date.now()
            // 冷却内不重复弹，避免一次失效连弹多次
            if (now - lastAutoOpenAt < REOPEN_COOLDOWN_MS) {
                return
            }
            lastAutoOpenAt = now
            handlerRef.current()
        }
        window.addEventListener(NETEASE_LOGIN_REQUIRED_EVENT, handle)
        return () =>
            window.removeEventListener(NETEASE_LOGIN_REQUIRED_EVENT, handle)
    }, [])
}

export { useOpenAuthOnExpiry }