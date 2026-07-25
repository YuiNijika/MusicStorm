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
            unlistenTick = unlistenTick
        } catch (error) {
            handlers.onError?.(
                error instanceof Error ? error.message : "无法订阅原生音频事件",
            )
        }
    })()

    let playGen = 0

    return {
        load(url) {
            currentSource = url
            positionMs = 0
            // 仅本地 path；play 时真正解码，load 做路径校验
            void invoke("audio_load", {
                urlOrPath: url,
                kind: "local",
            }).catch((error: unknown) => {
                handlers.onError?.(
                    error instanceof Error ? error.message : "加载失败",
                )
            })
        },
        async play() {
            if (!currentSource) {
                throw new Error("无音频源")
            }
            const gen = ++playGen
            applyVolume()
            await invoke("audio_play", {
                urlOrPath: currentSource,
                kind: "local",
            })
            if (gen !== playGen) {
                // 已被更新的 pause 作废
                void invoke("audio_pause").catch(() => {})
                return
            }
            handlers.onPlay?.()
        },
        pause() {
            playGen += 1
            void invoke("audio_pause").catch(() => {})
            handlers.onPause?.()
        },
        seek(nextMs) {
            if (!Number.isFinite(nextMs)) {
                return
            }
            positionMs = Math.max(0, nextMs)
            void invoke("audio_seek", { positionMs: positionMs }).catch(() => {})
            handlers.onTimeUpdate?.(positionMs, durationMs)
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