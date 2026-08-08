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
    /** opts.resume：本地 WASAPI 快进后是否继续播 */
    seek: (positionMs: number, opts?: { resume?: boolean }) => void | Promise<void>
    setVolume: (volume: number) => void
    setMuted: (muted: boolean) => void
    getPositionMs: () => number
    getDurationMs: () => number
    destroy: () => void
}

function createHtml5Engine(handlers: AudioEngineHandlers = {}): AudioEngine {
    const audio = new Audio()
    audio.preload = "metadata"
    audio.setAttribute("playsinline", "")
    // 移动端（Android WebView / iOS WKWebView）需要允许内联播放，
    // 否则 play() 会被系统拦截仅允许全屏

    // 加载完成后 resolve 的 Promise；切曲时取消等待避免卡死
    let readyPromise: Promise<void> | null = null
    let readyCancel = false

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
                readyPromise = new Promise<void>((resolve) => {
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