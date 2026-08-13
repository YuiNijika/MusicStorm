import { useCallback, useEffect, useRef, useState } from "react"

import { createQrSession, pollQrLogin } from "@/lib/netease/auth"

const QR_POLL_MS = 2_000

type QrUiState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "waiting"; qrimg: string; hint: string }
    | { kind: "error"; message: string }

function useQrLogin(onSuccess: () => void | Promise<void>) {
    const [qrState, setQrState] = useState<QrUiState>({ kind: "idle" })
    const pollKeyRef = useRef<string | null>(null)
    const timerRef = useRef<number | null>(null)
    const startRef = useRef<() => Promise<void>>(async () => {})
    const onSuccessRef = useRef(onSuccess)
    // 登录成功（803）到弹窗关闭之间 kind 被重置为 idle，会再次触发 startQrLogin
    // 重新轮询；用标志阻断，否则弹窗关闭后后台仍在请求 login/qr/check
    const succeededRef = useRef(false)
    onSuccessRef.current = onSuccess

    const stopPolling = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
        }
        pollKeyRef.current = null
    }, [])

    const startQrLogin = useCallback(async () => {
        if (succeededRef.current) {
            return
        }
        stopPolling()
        setQrState({ kind: "loading" })
        try {
            const session = await createQrSession()
            pollKeyRef.current = session.key
            setQrState({
                kind: "waiting",
                qrimg: session.qrimg,
                hint: "请使用网易云 App 扫码",
            })

            const tick = async () => {
                const key = pollKeyRef.current
                if (!key) {
                    return
                }
                try {
                    const code = await pollQrLogin(key)
                    if (code === 803) {
                        succeededRef.current = true
                        stopPolling()
                        setQrState({ kind: "idle" })
                        await onSuccessRef.current()
                        return
                    }
                    if (code === 800) {
                        void startRef.current()
                        return
                    }
                    if (code === 802) {
                        setQrState((prev) =>
                            prev.kind === "waiting"
                                ? { ...prev, hint: "已扫码，请在手机上确认" }
                                : prev,
                        )
                    }
                    timerRef.current = window.setTimeout(() => {
                        void tick()
                    }, QR_POLL_MS)
                } catch {
                    stopPolling()
                    setQrState({ kind: "error", message: "登录检查失败，请重试" })
                }
            }

            timerRef.current = window.setTimeout(() => {
                void tick()
            }, QR_POLL_MS)
        } catch {
            setQrState({ kind: "error", message: "无法生成二维码，请确认 API 可用" })
        }
    }, [stopPolling])

    startRef.current = startQrLogin

    useEffect(() => () => stopPolling(), [stopPolling])

    const reset = useCallback(() => {
        succeededRef.current = false
        stopPolling()
        setQrState({ kind: "idle" })
    }, [stopPolling])

    return { qrState, startQrLogin, stopPolling, reset }
}

export { useQrLogin }
export type { QrUiState }