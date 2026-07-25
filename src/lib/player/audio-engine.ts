type AudioEngineHandlers = {
    onTimeUpdate?: (positionMs: number, durationMs: number) => void
    onEnded?: () => void
    onPlay?: () => void
    onPause?: () => void
    onError?: (message: string) => void
}

type AudioEngine = {
    load: (url: string) => void
    play: () => Promise<void>
    pause: () => void
    seek: (positionMs: number) => void
    setVolume: (volume: number) => void
    setMuted: (muted: boolean) => void
    getPositionMs: () => number
    getDurationMs: () => number
    destroy: () => void
}

function createHtml5Engine(handlers: AudioEngineHandlers = {}): AudioEngine {
    const audio = new Audio()
    audio.preload = "metadata"

    const onTimeUpdate = () => {
        handlers.onTimeUpdate?.(audio.currentTime * 1000, safeDurationMs(audio))
    }
    const onEnded = () => handlers.onEnded?.()
    const onPlay = () => handlers.onPlay?.()
    const onPause = () => handlers.onPause?.()
    const onError = () => {
        handlers.onError?.(audio.error?.message ?? "音频加载失败")
    }

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
            audio.src = url
            audio.load()
        },
        async play() {
            await audio.play()
        },
        pause() {
            audio.pause()
        },
        seek(positionMs) {
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