import { useEffect, useState } from "react"
import { RotateCw } from "lucide-react"

import { Input } from "@/components/ui/input"
import { fetchCaptcha, type Captcha } from "@/lib/feedback/api"

export interface CaptchaValue {
    id: string
    code: string
    expiresAt: number
}

function CaptchaField({ value, onChange, refreshSignal, disabled, onConfirm }: {
    value: CaptchaValue
    onChange: (value: CaptchaValue) => void
    refreshSignal: number
    disabled: boolean
    onConfirm?: () => void
}) {
    const [captcha, setCaptcha] = useState<Captcha | null>(null)
    const [attempt, setAttempt] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError("")
        setCaptcha(null)
        onChange({ id: "", code: "", expiresAt: 0 })
        void fetchCaptcha(controller.signal).then((data) => {
            if (controller.signal.aborted) {
                return
            }
            if (data.expires_at * 1000 <= Date.now()) {
                throw new Error("验证码已过期，请刷新并检查设备时间。")
            }
            setCaptcha(data)
            onChange({ id: data.id, code: "", expiresAt: data.expires_at })
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) {
                setError(error instanceof Error ? error.message : "验证码加载失败，请刷新。")
            }
        }).finally(() => {
            if (!controller.signal.aborted) {
                setLoading(false)
            }
        })
        return () => controller.abort()
    }, [attempt, refreshSignal, onChange])

    useEffect(() => {
        if (!captcha || disabled) {
            return
        }
        const timeout = window.setTimeout(
            () => setAttempt((value) => value + 1),
            Math.max(0, captcha.expires_at * 1000 - Date.now()),
        )
        return () => window.clearTimeout(timeout)
    }, [captcha, disabled])

    return (
        <div className="feedback-field feedback-captcha">
            <label htmlFor="feedback-captcha">验证码</label>
            <div className="feedback-captcha-controls">
                <button type="button" title="刷新验证码" aria-label="刷新验证码"
                    disabled={disabled || loading}
                    onClick={() => setAttempt((value) => value + 1)}
                    className="feedback-control feedback-captcha-image">
                    {captcha ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha.image)}`}
                        alt="验证码" width={140} height={48} />
                        : <RotateCw className={`size-4 text-black ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />}
                </button>
                <Input id="feedback-captcha" name="captcha" autoComplete="off" spellCheck={false}
                    required maxLength={10} value={value.code}
                    onChange={(event) => onChange({ ...value, code: event.target.value })}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && onConfirm) {
                            event.preventDefault()
                            onConfirm()
                        }
                    }}
                    disabled={disabled || loading || !captcha}
                    className="feedback-input feedback-captcha-input"
                    aria-describedby={error ? "feedback-captcha-error" : undefined}
                    aria-invalid={Boolean(error)} />
            </div>
            <div aria-live="polite">
                {loading ? <p className="feedback-footnote">验证码加载中…</p> : null}
                {error ? <p id="feedback-captcha-error" className="text-sm text-destructive">{error}</p> : null}
            </div>
        </div>
    )
}

export { CaptchaField }
