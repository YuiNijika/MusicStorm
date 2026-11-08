import { useEffect } from "react"

import { useNeteaseSession } from "@/hooks/use-netease-session"
import { maybeAutoSignin } from "@/lib/netease/daily-signin"

/**
 * 每日自动签到调度：
 * - 登录态就绪后立即检查一次（覆盖「时间戳为零 / 未签到 / 跨天打开应用」）
 * - 常驻期间每分钟检查，覆盖「零点仍在应用内」的跨天场景
 * - 真正的签到动作由 daily-signin 模块按自然日去重，不会重复请求
 */
function useAutoSignin() {
    const { ready, loggedIn, activeUserId } = useNeteaseSession()

    useEffect(() => {
        if (!ready || !loggedIn || activeUserId == null) {
            return
        }
        const run = () => {
            void maybeAutoSignin(activeUserId)
        }
        run()
        const timer = window.setInterval(run, 60_000)
        return () => {
            window.clearInterval(timer)
        }
    }, [ready, loggedIn, activeUserId])
}

export { useAutoSignin }
