/** 原生 WASAPI 引擎：invoke + event */

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import type { AudioEngine, AudioEngineHandlers } from "@/lib/player/audio-engine"
import { isTauriRuntime } from "@/lib/player/native-bridge"

type AudioTickPayload = {
    positionMs: number
    durationMs: number
    ended?: boolean
}

function createNativeEngine(handlers: AudioEngineHandlers = {}): AudioEngine {
    if (!isTauriRuntime()) {
        throw new Error("Native engine requires Tauri")
    }

    let positionMs = 0
    let durationMs = 0
    let volume = 1
    let muted = false
    let currentSource: string | null = null
    let unlistenTick: UnlistenFn | null = null
    let unlistenEnded: UnlistenFn | null = null
    let destroyed = false
    /** load/play/pause 世代：过期操作不得再 pause 新会话或抛全局 onError */
    let opGen = 0

    const applyVolume = () => {
        void invoke("audio_set_volume", {
            volume: muted ? 0 : volume,
        }).catch(() => {})
    }

    void (async () => {
        try {
            unlistenTick = await listen<AudioTickPayload>("audio://tick", (event) => {
                if (destroyed) {
                    return
                }
                positionMs = event.payload.positionMs
                durationMs = event.payload.durationMs
                handlers.onTimeUpdate?.(positionMs, durationMs)
                if (event.payload.ended) {
                    handlers.onEnded?.()
                }
            })
            unlistenEnded = await listen("audio://ended", () => {
                if (!destroyed) {
                    handlers.onEnded?.()
                }
            })
        } catch (error) {
            handlers.onError?.(
                error instanceof Error ? error.message : "无法订阅原生音频事件",
            )
        }
    })()

    return {
        async load(url) {
            currentSource = url
            positionMs = 0
            const gen = ++opGen
            try {
                // 先停再 load，避免与上一曲 play 解码抢同一 worker 队列语义不清
                await invoke("audio_stop")
                if (destroyed || gen !== opGen || currentSource !== url) {
                    return
                }
                await invoke("audio_load", {
                    urlOrPath: url,
                    kind: "local",
                })
            } catch (error: unknown) {
                if (destroyed || gen !== opGen || currentSource !== url) {
                    return
                }
                // 由 use-player await 捕获并决定 H5 回退；勿再 onError 以免双杀 isPlaying
                throw error instanceof Error
                    ? error
                    : new Error("加载失败")
            }
        },
        async play() {
            if (!currentSource) {
                throw new Error("无音频源")
            }
            const source = currentSource
            const gen = ++opGen
            applyVolume()
            await invoke("audio_play", {
                urlOrPath: source,
                kind: "local",
            })
            // 切曲/暂停已推进 opGen：作废本次，勿保持在播
            if (destroyed || gen !== opGen || currentSource !== source) {
                void invoke("audio_pause").catch(() => {})
                return
            }
            handlers.onPlay?.()
        },
        pause() {
            opGen += 1
            void invoke("audio_pause").catch(() => {})
            handlers.onPause?.()
        },
        async seek(nextMs, opts) {
            if (!Number.isFinite(nextMs)) {
                return
            }
            positionMs = Math.max(0, nextMs)
            handlers.onTimeUpdate?.(positionMs, durationMs)
            const resume = Boolean(opts?.resume)
            await invoke("audio_seek", {
                positionMs: positionMs,
                resume,
            })
        },
        setVolume(next) {
            volume = Math.min(1, Math.max(0, next))
            applyVolume()
        },
        setMuted(next) {
            muted = next
            applyVolume()
        },
        getPositionMs: () => positionMs,
        getDurationMs: () => durationMs,
        destroy() {
            destroyed = true
            opGen += 1
            void invoke("audio_stop").catch(() => {})
            void unlistenTick?.()
            void unlistenEnded?.()
            unlistenTick = null
            unlistenEnded = null
            currentSource = null
        },
    }
}

export { createNativeEngine }