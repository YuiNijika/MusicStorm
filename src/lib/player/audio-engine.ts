type AudioEngineHandlers = {
    onTimeUpdate?: (positionMs: number, durationMs: number) => void
    onEnded?: () => void
    onPlay?: () => void
    onPause?: () => void
    onError?: (message: string) => void
}

type AudioEngine = {
    /** 可同步或异步；调用方应 await Promise.resolve(engine.load(...)) */
    load: (url: string) => void | Promise<void>
    play: () => Promise<void>
    pause: () => void
    /** opts.resume：本地原生引擎快进后是否继续播 */
    seek: (positionMs: number, opts?: { resume?: boolean }) => void | Promise<void>
    setVolume: (volume: number) => void
    setMuted: (muted: boolean) => void
    /** 10 段均衡器：gains 为各频段增益 dB，enabled 关闭时等效平直 */
    setEq: (gains: number[], enabled: boolean) => void
    getPositionMs: () => number
    getDurationMs: () => number
    destroy: () => void
}

// 10 段均衡器中心频率，与 eq-prefs.ts 的 EQ_BAND_FREQUENCIES 对齐
const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

function createHtml5Engine(handlers: AudioEngineHandlers = {}): AudioEngine {
    const MEDIA_READY_TIMEOUT_MS = 15_000
    const audio = new Audio()
    audio.preload = "metadata"
    audio.setAttribute("playsinline", "")
    // 移动端（Android WebView / iOS WKWebView）需要允许内联播放，
    // 否则 play() 会被系统拦截仅允许全屏
    // 均衡器经 createMediaElementSource 接管输出，需 CORS 干净的媒体源，
    // 否则跨域音频被 Web Audio 判为污染而静音；本地 asset/blob 同源不受影响
    audio.crossOrigin = "anonymous"

    // 加载完成后 resolve 的 Promise；切曲时取消等待避免卡死
    let readyPromise: Promise<void> | null = null
    let readyCancel = false
    // Web Audio 均衡器：惰性创建，仅启用 EQ 时才接管音频输出
    let eqContext: AudioContext | null = null
    let eqFilters: BiquadFilterNode[] = []

    function ensureEqGraph(): void {
        if (eqContext) {
            return
        }
        const Ctor =
            window.AudioContext ??
            (
                window as unknown as {
                    webkitAudioContext?: typeof AudioContext
                }
            ).webkitAudioContext
        if (!Ctor) {
            return
        }
        const context = new Ctor()
        // createMediaElementSource 对同一元素只能调用一次，之后音频统一经 graph 输出
        const source = context.createMediaElementSource(audio)
        const filters = EQ_FREQUENCIES.map((freq, index) => {
            const filter = context.createBiquadFilter()
            filter.frequency.value = freq
            filter.type =
                index === 0
                    ? "lowshelf"
                    : index === EQ_FREQUENCIES.length - 1
                      ? "highshelf"
                      : "peaking"
            filter.Q.value = 1.0
            filter.gain.value = 0
            return filter
        })
        source.connect(filters[0]!)
        for (let i = 0; i < filters.length - 1; i += 1) {
            filters[i]!.connect(filters[i + 1]!)
        }
        filters[filters.length - 1]!.connect(context.destination)
        eqContext = context
        eqFilters = filters
    }

    const onCanPlay = () => {
        readyPromise = null
    }
    const onTimeUpdate = () => {
        handlers.onTimeUpdate?.(audio.currentTime * 1000, safeDurationMs(audio))
    }
    const onEnded = () => handlers.onEnded?.()
    const onPlay = () => handlers.onPlay?.()
    const onPause = () => handlers.onPause?.()
    const onError = () => {
        readyPromise = null
        handlers.onError?.(audio.error?.message ?? "音频加载失败")
    }

    audio.addEventListener("canplay", onCanPlay)
    audio.addEventListener("canplaythrough", onCanPlay)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("durationchange", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("error", onError)

    return {
        load(url) {
            if (audio.src === url) {
                return
            }
            readyCancel = true
            readyPromise = null
            audio.src = url
            audio.load()
            readyCancel = false
        },
        async play() {
            // 移动端 WebView 中，load() 尚未完成时 play() 会抛 AbortError。
            // 等待 canplay 事件确认媒体可播后再调用 play()。
            if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !readyPromise) {
                readyPromise = new Promise<void>((resolve, reject) => {
                    let timer: ReturnType<typeof setTimeout> | undefined
                    const onReady = () => {
                        cleanup()
                        if (readyCancel) return
                        resolve()
                    }
                    const onErr = () => {
                        cleanup()
                        if (readyCancel) return
                        resolve()
                    }
                    const cleanup = () => {
                        if (timer !== undefined) {
                            clearTimeout(timer)
                        }
                        audio.removeEventListener("canplay", onReady)
                        audio.removeEventListener("canplaythrough", onReady)
                        audio.removeEventListener("error", onErr)
                    }
                    // 已经 ready 了（事件在我们注册之前触发）
                    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
                        cleanup()
                        resolve()
                        return
                    }
                    audio.addEventListener("canplay", onReady)
                    audio.addEventListener("canplaythrough", onReady)
                    audio.addEventListener("error", onErr)
                    timer = setTimeout(() => {
                        cleanup()
                        readyPromise = null
                        reject(new Error("在线音频加载超时"))
                    }, MEDIA_READY_TIMEOUT_MS)
                })
            }
            if (readyPromise) {
                await readyPromise
            }
            await audio.play()
        },
        pause() {
            audio.pause()
        },
        seek(positionMs, _opts) {
            if (!Number.isFinite(positionMs)) {
                return
            }
            const duration = safeDurationMs(audio)
            const nextSec =
                duration > 0
                    ? Math.min(Math.max(0, positionMs), duration) / 1000
                    : Math.max(0, positionMs) / 1000
            audio.currentTime = nextSec
            handlers.onTimeUpdate?.(audio.currentTime * 1000, duration)
        },
        setVolume(volume) {
            audio.volume = Math.min(1, Math.max(0, volume))
        },
        setMuted(muted) {
            audio.muted = muted
        },
        setEq(gains, enabled) {
            if (!enabled) {
                // 旁路：graph 已建时增益归零等效平直；未建则 audio 直接输出，无需处理
                for (const filter of eqFilters) {
                    filter.gain.value = 0
                }
                return
            }
            ensureEqGraph()
            for (let i = 0; i < eqFilters.length; i += 1) {
                eqFilters[i]!.gain.value = gains[i] ?? 0
            }
        },
        getPositionMs() {
            return audio.currentTime * 1000
        },
        getDurationMs() {
            return safeDurationMs(audio)
        },
        destroy() {
            audio.pause()
            audio.removeEventListener("timeupdate", onTimeUpdate)
            audio.removeEventListener("durationchange", onTimeUpdate)
            audio.removeEventListener("ended", onEnded)
            audio.removeEventListener("play", onPlay)
            audio.removeEventListener("pause", onPause)
            audio.removeEventListener("error", onError)
            audio.removeAttribute("src")
            audio.load()
            void eqContext?.close()
            eqContext = null
            eqFilters = []
        },
    }
}

/** @deprecated 使用 createHtml5Engine；保留别名兼容 */
const createAudioEngine = createHtml5Engine

function safeDurationMs(audio: HTMLAudioElement): number {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return 0
    }
    return audio.duration * 1000
}

export { createAudioEngine, createHtml5Engine }
export type { AudioEngine, AudioEngineHandlers }
