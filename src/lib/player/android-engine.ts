import {
    hasAndroidAudio,
    listenAndroidAudioState,
    pauseAndroidPlayback,
    prepareAndroidFile,
    seekAndroidPlayback,
    setAndroidPlaybackMuted,
    setAndroidPlaybackVolume,
    startAndroidPlayback,
    stopAndroidPlayback,
    type AudioStatePayload,
} from "@/lib/android/native-bridge"
import type {
    AudioEngine,
    AudioEngineHandlers,
} from "@/lib/player/audio-engine"
import { isAndroid } from "@/lib/platform"

// Android 系统 MediaPlayer 引擎：本地高音质走系统解码，对齐桌面 rodio 引擎的角色。
// 控制经 JS 桥投递到 Kotlin HandlerThread，状态由 musicstorm:audio-state 事件驱动，
// 这里只维护缓存位置/时长，不做同步轮询。
function createAndroidEngine(handlers: AudioEngineHandlers = {}): AudioEngine {
    if (!isAndroid() || !hasAndroidAudio()) {
        throw new Error("Android engine requires the native bridge")
    }

    let positionMs = 0
    let durationMs = 0
    let volume = 1
    let currentSource: string | null = null
    let lastPlaying: boolean | null = null
    let unlistenAudioState: (() => void) | null = null
    let destroyed = false

    const applyVolume = () => {
        setAndroidPlaybackVolume(volume)
    }

    const onState = (payload: AudioStatePayload) => {
        if (destroyed) {
            return
        }
        if (typeof payload.positionMs === "number") {
            positionMs = payload.positionMs
        }
        if (typeof payload.durationMs === "number" && payload.durationMs > 0) {
            durationMs = payload.durationMs
        }
        if (payload.error) {
            lastPlaying = false
            handlers.onError?.(payload.error)
            return
        }
        if (payload.ended) {
            lastPlaying = false
            handlers.onEnded?.()
            return
        }
        if (payload.playing !== lastPlaying) {
            lastPlaying = payload.playing
            if (payload.playing) {
                handlers.onPlay?.()
            } else {
                handlers.onPause?.()
            }
        }
        handlers.onTimeUpdate?.(positionMs, durationMs)
    }

    unlistenAudioState = listenAndroidAudioState(onState)

    return {
        load(url) {
            currentSource = url
            positionMs = 0
            durationMs = 0
            prepareAndroidFile(url)
        },
        async play() {
            if (!currentSource) {
                throw new Error("无音频源")
            }
            applyVolume()
            startAndroidPlayback()
            handlers.onPlay?.()
        },
        pause() {
            pauseAndroidPlayback()
            handlers.onPause?.()
        },
        seek(nextMs, opts) {
            if (!Number.isFinite(nextMs)) {
                return
            }
            const resume = Boolean(opts?.resume)
            positionMs = Math.max(0, nextMs)
            handlers.onTimeUpdate?.(positionMs, durationMs)
            seekAndroidPlayback(positionMs, resume)
        },
        setVolume(next) {
            volume = Math.min(1, Math.max(0, next))
            applyVolume()
        },
        setMuted(next) {
            setAndroidPlaybackMuted(next)
        },
        setEq(_gains, _enabled) {
            // Android 系统解码无 10 段 biquad；音量直通系统，EQ 暂不生效
        },
        getPositionMs: () => positionMs,
        getDurationMs: () => durationMs,
        destroy() {
            destroyed = true
            stopAndroidPlayback()
            unlistenAudioState?.()
            unlistenAudioState = null
            currentSource = null
        },
    }
}

export { createAndroidEngine }
