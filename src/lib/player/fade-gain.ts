/** 淡入淡出增益 ramp，不写 UI 音量 */

type FadeGainController = {
    getGain: () => number
    /** 瞬时设值并 apply */
    setGain: (gain: number) => void
    fadeTo: (target: number, durationMs: number) => Promise<void>
    cancel: () => void
    destroy: () => void
}

type FadeGainOptions = {
    onApply: (gain: number) => void
    initialGain?: number
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value))
}

function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function createFadeGainController(options: FadeGainOptions): FadeGainController {
    let gain = clamp01(options.initialGain ?? 1)
    let rafId: number | null = null
    let generation = 0
    let destroyed = false

    const apply = (next: number) => {
        gain = clamp01(next)
        if (!destroyed) {
            options.onApply(gain)
        }
    }

    const cancel = () => {
        generation += 1
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
            rafId = null
        }
    }

    apply(gain)

    return {
        getGain: () => gain,
        setGain: (next) => {
            cancel()
            apply(next)
        },
        fadeTo(target, durationMs) {
            if (destroyed) {
                return Promise.resolve()
            }
            const to = clamp01(target)
            cancel()
            const from = gain
            const ms = Math.max(0, durationMs)

            if (ms <= 0 || Math.abs(to - from) < 0.001) {
                apply(to)
                return Promise.resolve()
            }

            const token = generation
            const started = performance.now()

            return new Promise((resolve) => {
                const tick = (now: number) => {
                    if (destroyed || token !== generation) {
                        resolve()
                        return
                    }
                    const t = Math.min(1, (now - started) / ms)
                    apply(from + (to - from) * easeInOut(t))
                    if (t >= 1) {
                        rafId = null
                        apply(to)
                        resolve()
                        return
                    }
                    rafId = requestAnimationFrame(tick)
                }
                rafId = requestAnimationFrame(tick)
            })
        },
        cancel,
        destroy() {
            destroyed = true
            cancel()
        },
    }
}

export { createFadeGainController }
export type { FadeGainController }