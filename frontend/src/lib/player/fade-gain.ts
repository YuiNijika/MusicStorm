// 淡入淡出增益 ramp，不写 UI 音量

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

// 后台隐藏页面的定时器节流下限，足够推完一段几百毫秒的 ramp
const HIDDEN_TICK_MS = 32

type TickHandle = {
    isRaf: boolean
    id: number
}

// 后台页面的 rAF 不再触发：淡出用 await 等待 ramp 完成才切下一首，
// 纯 rAF 会让这个 await 永远挂着，自动切歌就死锁在淡出一步。
// 隐藏时退回定时器推进，可见时保持 rAF 逐帧顺滑
function scheduleTick(tick: (now: number) => void): TickHandle {
    if (typeof document !== "undefined" && document.hidden) {
        return {
            isRaf: false,
            id: window.setTimeout(() => tick(performance.now()), HIDDEN_TICK_MS),
        }
    }
    return { isRaf: true, id: requestAnimationFrame(tick) }
}

function cancelTick(handle: TickHandle | null): void {
    if (!handle) {
        return
    }
    if (handle.isRaf) {
        cancelAnimationFrame(handle.id)
        return
    }
    window.clearTimeout(handle.id)
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value))
}

function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function createFadeGainController(options: FadeGainOptions): FadeGainController {
    let gain = clamp01(options.initialGain ?? 1)
    let tickHandle: TickHandle | null = null
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
        cancelTick(tickHandle)
        tickHandle = null
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
                        tickHandle = null
                        apply(to)
                        resolve()
                        return
                    }
                    tickHandle = scheduleTick(tick)
                }
                tickHandle = scheduleTick(tick)
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