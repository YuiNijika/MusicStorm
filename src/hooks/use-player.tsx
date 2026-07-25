import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react"

import { recordPlaySessionEnd, startPlaySession } from "@/lib/db/play-stats"
import { resolvePlayableUrl } from "@/lib/music/resolve-url"
import { getNeteaseQualityBr } from "@/lib/netease/quality"
import {
    createHtml5Engine,
    type AudioEngine,
    type AudioEngineHandlers,
} from "@/lib/player/audio-engine"
import {
    getEnginePref,
    resolveEngineChoice,
    type EngineStatus,
} from "@/lib/player/engine-policy"
import { createFadeGainController } from "@/lib/player/fade-gain"
import { resolveFadeDurationMs } from "@/lib/player/fade-prefs"
import { shouldUseWasapiForTrack } from "@/lib/player/local-quality"
import { createNativeEngine } from "@/lib/player/native-engine"
import {
    readPlaybackSession,
    writePlaybackSession,
} from "@/lib/player/playback-session"
import type { PlayerSnapshot, RepeatMode, Track } from "@/lib/types"

type PlayerContextValue = PlayerSnapshot & {
    currentTrack: Track | null
    engineStatus: EngineStatus
    playTrack: (track: Track, queue?: Track[]) => void
    /** 同曲再点：播放中暂停 / 已暂停则继续；异曲：换队列并播 */
    playOrToggle: (track: Track, queue?: Track[]) => void
    reloadCurrent: () => void
    togglePlay: () => void
    next: () => void
    previous: () => void
    seek: (positionMs: number) => void
    setVolume: (volume: number) => void
    toggleMute: () => void
    toggleShuffle: () => void
    cycleRepeat: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

function formatInvokeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === "string") {
        return error
    }
    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string" && message) {
            return message
        }
    }
    try {
        return JSON.stringify(error)
    } catch {
        return "play failed"
    }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
    const restored = useMemo(() => readPlaybackSession(), [])

    const [queue, setQueue] = useState<Track[]>(() => restored?.queue ?? [])
    const [currentIndex, setCurrentIndex] = useState(
        () => restored?.currentIndex ?? -1,
    )
    const [isPlaying, setIsPlaying] = useState(
        () => Boolean(restored?.wasPlaying && restored.queue.length > 0),
    )
    const [positionMs, setPositionMs] = useState(
        () => restored?.positionMs ?? 0,
    )
    const [durationMs, setDurationMs] = useState(() => {
        const track = restored?.queue[restored.currentIndex]
        return track?.durationMs ?? 0
    })
    const [volume, setVolumeState] = useState(() => restored?.volume ?? 0.8)
    const [reloadNonce, setReloadNonce] = useState(0)
    const [isMuted, setIsMuted] = useState(() => restored?.isMuted ?? false)
    const [shuffle, setShuffle] = useState(() => restored?.shuffle ?? false)
    const [repeat, setRepeat] = useState<RepeatMode>(
        () => restored?.repeat ?? "off",
    )
    const [engineStatus, setEngineStatus] = useState<EngineStatus>("html5")
    const [engineEpoch, setEngineEpoch] = useState(0)
    /** 引擎实例真正挂载后递增，驱动恢复会话重新 load） */
    const [enginesReadyToken, setEnginesReadyToken] = useState(0)
    /** load 就绪后递增，驱动 pause/resume effect 统一 play */
    const [readyEpoch, setReadyEpoch] = useState(0)

    const html5Ref = useRef<AudioEngine | null>(null)
    const nativeRef = useRef<AudioEngine | null>(null)
    const activeRef = useRef<AudioEngine | null>(null)
    const nativeAvailableRef = useRef(false)

    const queueRef = useRef(queue)
    const indexRef = useRef(currentIndex)
    const repeatRef = useRef(repeat)
    const isPlayingRef = useRef(isPlaying)
    const volumeRef = useRef(volume)
    const mutedRef = useRef(isMuted)
    const loadedTrackIdRef = useRef<string | null>(null)
    /** load 完成后才为 true，pause/resume 才接管 */
    const mediaReadyRef = useRef(false)
    const sessionIdRef = useRef<string | null>(null)
    const sessionTrackRef = useRef<Track | null>(null)
    const sessionStartedAtRef = useRef(0)
    const sessionListenedRef = useRef(0)
    const lastTickPosRef = useRef(0)
    const positionRef = useRef(0)
    const durationRef = useRef(0)
    const engineStatusRef = useRef<EngineStatus>("html5")
    const loadGenRef = useRef(0)
    const pauseGenRef = useRef(0)
    const skipFadeOutOnLoadRef = useRef(false)
    /** 启动恢复进度，load 完成后 seek 一次 */
    const pendingSeekMsRef = useRef(
        restored && restored.positionMs > 0 ? restored.positionMs : null,
    )
    const lastSessionWriteRef = useRef(0)

    const fadeRef = useRef(
        createFadeGainController({
            onApply: (gain) => {
                const engine = activeRef.current
                if (!engine) {
                    return
                }
                const linear = mutedRef.current ? 0 : volumeRef.current
                engine.setVolume(linear * linear * gain)
            },
            initialGain: 1,
        }),
    )

    useEffect(() => {
        queueRef.current = queue
        indexRef.current = currentIndex
        repeatRef.current = repeat
        isPlayingRef.current = isPlaying
        volumeRef.current = volume
        mutedRef.current = isMuted
        positionRef.current = positionMs
        durationRef.current = durationMs
        engineStatusRef.current = engineStatus
    }, [
        queue,
        currentIndex,
        repeat,
        isPlaying,
        volume,
        isMuted,
        positionMs,
        durationMs,
        engineStatus,
    ])

    // 播放会话落盘（进度节流）
    useEffect(() => {
        if (queue.length === 0 || currentIndex < 0) {
            return
        }
        const now = Date.now()
        const force =
            now - lastSessionWriteRef.current > 1800 ||
            !isPlaying
        if (!force && now - lastSessionWriteRef.current < 1800) {
            return
        }
        lastSessionWriteRef.current = now
        writePlaybackSession({
            queue,
            currentIndex,
            positionMs,
            volume,
            isMuted,
            shuffle,
            repeat,
            wasPlaying: isPlaying,
        })
    }, [
        queue,
        currentIndex,
        positionMs,
        volume,
        isMuted,
        shuffle,
        repeat,
        isPlaying,
    ])

    const applyUserVolume = useCallback(() => {
        const engine = activeRef.current
        if (!engine) {
            return
        }
        const gain = fadeRef.current.getGain()
        // 听感曲线：UI 线性 0–1，引擎用平方，避免高音区过“炸”
        const linear = mutedRef.current ? 0 : volumeRef.current
        const perceptual = linear * linear
        engine.setVolume(perceptual * gain)
    }, [])

    /** 立即静音停引擎；与 isPlaying 状态无关，供用户暂停 / 竞态收尾 */
    const hardStopEngines = useCallback(() => {
        pauseGenRef.current += 1
        fadeRef.current.cancel()
        fadeRef.current.setGain(0)
        activeRef.current?.pause()
        html5Ref.current?.pause()
        nativeRef.current?.pause()
        applyUserVolume()
    }, [applyUserVolume])

    /** 与 isPlayingRef 同拍，暂停路径立刻 hardStop */
    const setPlaying = useCallback(
        (next: boolean | ((prev: boolean) => boolean)) => {
            const prev = isPlayingRef.current
            const value = typeof next === "function" ? next(prev) : next
            isPlayingRef.current = value
            if (!value) {
                hardStopEngines()
            }
            setIsPlaying(value)
        },
        [hardStopEngines],
    )

    const flushSession = useCallback((completed: boolean) => {
        const sessionId = sessionIdRef.current
        const track = sessionTrackRef.current
        if (!sessionId || !track) {
            return
        }
        const listenedMs = Math.max(0, Math.round(sessionListenedRef.current))
        void recordPlaySessionEnd({
            id: sessionId,
            trackId: track.id,
            source: track.source,
            startedAt: sessionStartedAtRef.current,
            endedAt: Date.now(),
            listenedMs,
            completed,
            qualityBr: track.source === "netease" ? getNeteaseQualityBr() : null,
        })
        sessionIdRef.current = null
        sessionTrackRef.current = null
        sessionListenedRef.current = 0
    }, [])

    const beginSession = useCallback(
        (track: Track) => {
            if (sessionIdRef.current && sessionTrackRef.current) {
                const duration = durationRef.current || sessionTrackRef.current.durationMs
                const completed =
                    duration > 0
                        ? positionRef.current / duration >= 0.8 ||
                          sessionListenedRef.current >= duration * 0.8
                        : false
                flushSession(completed)
            }
            const id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `ps-${Date.now()}`
            sessionIdRef.current = id
            sessionTrackRef.current = track
            sessionStartedAtRef.current = Date.now()
            sessionListenedRef.current = 0
            lastTickPosRef.current = 0
            void startPlaySession({
                id,
                trackId: track.id,
                source: track.source,
                startedAt: sessionStartedAtRef.current,
                qualityBr: track.source === "netease" ? getNeteaseQualityBr() : null,
            })
        },
        [flushSession],
    )

    const advance = useCallback((direction: 1 | -1) => {
        const list = queueRef.current
        const idx = indexRef.current
        if (list.length === 0) {
            return
        }

        if (direction === 1) {
            if (idx < list.length - 1) {
                loadedTrackIdRef.current = null
                mediaReadyRef.current = false
                setCurrentIndex(idx + 1)
                setPositionMs(0)
                isPlayingRef.current = true
                setIsPlaying(true)
                return
            }
            if (repeatRef.current === "all") {
                loadedTrackIdRef.current = null
                mediaReadyRef.current = false
                setCurrentIndex(0)
                setPositionMs(0)
                isPlayingRef.current = true
                setIsPlaying(true)
                return
            }
            isPlayingRef.current = false
            hardStopEngines()
            setIsPlaying(false)
            return
        }

        if (idx > 0) {
            loadedTrackIdRef.current = null
            mediaReadyRef.current = false
            setCurrentIndex(idx - 1)
            setPositionMs(0)
            isPlayingRef.current = true
            setIsPlaying(true)
            return
        }
        setPositionMs(0)
        activeRef.current?.seek(0)
    }, [hardStopEngines])

    // 引擎初始化
    useEffect(() => {
        function onPrefChange() {
            setEngineEpoch((value) => value + 1)
        }
        window.addEventListener("musicstorm:engine-pref", onPrefChange)
        return () => window.removeEventListener("musicstorm:engine-pref", onPrefChange)
    }, [])

    useEffect(() => {
        let cancelled = false

        const handlers: AudioEngineHandlers = {
            onTimeUpdate: (position, duration) => {
                if (isPlayingRef.current && position > lastTickPosRef.current) {
                    sessionListenedRef.current += position - lastTickPosRef.current
                }
                lastTickPosRef.current = position
                setPositionMs(position)
                if (duration > 0) {
                    setDurationMs(duration)
                }
            },
            onEnded: () => {
                flushSession(true)
                skipFadeOutOnLoadRef.current = true
                mediaReadyRef.current = false
                if (repeatRef.current === "one") {
                    const track = queueRef.current[indexRef.current] ?? null
                    if (track) {
                        beginSession(track)
                    }
                    // 触发 reload 同曲
                    loadedTrackIdRef.current = null
                    setReloadNonce((n) => n + 1)
                    isPlayingRef.current = true
                    setIsPlaying(true)
                    return
                }
                advance(1)
            },
            onError: (message) => {
                console.warn("[player] engine error", message)
                isPlayingRef.current = false
                hardStopEngines()
                setIsPlaying(false)
            },
        }

        void (async () => {
            const choice = await resolveEngineChoice(getEnginePref())
            if (cancelled) {
                return
            }

            html5Ref.current?.destroy()
            nativeRef.current?.destroy()

            const html5 = createHtml5Engine(handlers)
            html5Ref.current = html5
            activeRef.current = html5
            nativeAvailableRef.current = false
            nativeRef.current = null

            // 仅探测并挂载 native 实例；默认显示 H5，按曲再切 WASAPI
            if (choice.nativeReady) {
                try {
                    nativeRef.current = createNativeEngine(handlers)
                    nativeAvailableRef.current = true
                    setEngineStatus(choice.status)
                    engineStatusRef.current = choice.status
                } catch {
                    setEngineStatus(
                        getEnginePref() === "wasapi" ? "degraded" : "html5",
                    )
                    engineStatusRef.current =
                        getEnginePref() === "wasapi" ? "degraded" : "html5"
                }
            } else {
                setEngineStatus(choice.status)
                engineStatusRef.current = choice.status
            }

            fadeRef.current.setGain(1)
            applyUserVolume()
            // 通知 load effect：html5/native 已可挂载
            setEnginesReadyToken((value) => value + 1)
        })()

        return () => {
            cancelled = true
            flushSession(false)
            html5Ref.current?.destroy()
            nativeRef.current?.destroy()
            html5Ref.current = null
            nativeRef.current = null
            activeRef.current = null
            loadedTrackIdRef.current = null
            mediaReadyRef.current = false
        }
    }, [advance, applyUserVolume, beginSession, engineEpoch, flushSession, hardStopEngines])

    useEffect(() => {
        return () => {
            fadeRef.current.destroy()
        }
    }, [])

    const currentTrack = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null
    const currentTrackId = currentTrack?.id ?? null

    // load + seek；play 交给 pause/resume effect
    useEffect(() => {
        const html5 = html5Ref.current
        if (!html5 || !currentTrack || !currentTrackId) {
            return
        }

        if (loadedTrackIdRef.current === currentTrackId && mediaReadyRef.current) {
            return
        }

        let cancelled = false
        const track = currentTrack
        const gen = ++loadGenRef.current
        loadedTrackIdRef.current = currentTrackId
        mediaReadyRef.current = false
        beginSession(track)

        void (async () => {
            const fadeMs = resolveFadeDurationMs()
            const skipOut = skipFadeOutOnLoadRef.current
            skipFadeOutOnLoadRef.current = false

            if (
                !skipOut &&
                isPlayingRef.current &&
                fadeMs > 0 &&
                fadeRef.current.getGain() > 0.05
            ) {
                await fadeRef.current.fadeTo(0, fadeMs)
            } else {
                fadeRef.current.setGain(0)
            }

            if (cancelled || gen !== loadGenRef.current) {
                return
            }

            fadeRef.current.cancel()
            activeRef.current?.pause()

            const pref = getEnginePref()
            const wantNative =
                nativeAvailableRef.current &&
                Boolean(nativeRef.current) &&
                shouldUseWasapiForTrack(track, pref)

            let engine: AudioEngine = html5
            let status: EngineStatus = "html5"
            let usedNative = false

            if (wantNative) {
                engine = nativeRef.current!
                status = "wasapi"
                usedNative = true
            } else if (pref === "wasapi" && track.filePath && !nativeAvailableRef.current) {
                // 用户强制本地 WASAPI 但 probe 失败
                status = "degraded"
            }

            activeRef.current = engine
            setEngineStatus(status)
            engineStatusRef.current = status
            applyUserVolume()

            const url =
                usedNative && track.filePath
                    ? track.filePath
                    : await resolvePlayableUrl(track)

            if (cancelled || gen !== loadGenRef.current) {
                return
            }
            if (!url) {
                isPlayingRef.current = false
                hardStopEngines()
                setIsPlaying(false)
                setDurationMs(track.durationMs)
                return
            }

            try {
                engine.load(url)
            } catch (error) {
                console.warn("[player] load failed", formatInvokeError(error))
                // 原生 load 失败 → 回退 H5 同曲
                if (usedNative && html5) {
                    activeRef.current = html5
                    setEngineStatus("degraded")
                    engineStatusRef.current = "degraded"
                    applyUserVolume()
                    const fallbackUrl = await resolvePlayableUrl(track)
                    if (!fallbackUrl || cancelled || gen !== loadGenRef.current) {
                        isPlayingRef.current = false
                        hardStopEngines()
                        setIsPlaying(false)
                        return
                    }
                    try {
                        html5.load(fallbackUrl)
                        engine = html5
                        usedNative = false
                    } catch (fallbackError) {
                        console.warn(
                            "[player] h5 load fallback failed",
                            formatInvokeError(fallbackError),
                        )
                        isPlayingRef.current = false
                        hardStopEngines()
                        setIsPlaying(false)
                        return
                    }
                } else {
                    isPlayingRef.current = false
                    hardStopEngines()
                    setIsPlaying(false)
                    return
                }
            }

            // load 完成：只标记 ready，play 由 resume effect 统一负责
            applyUserVolume()
            // 启动恢复进度
            const restoreMs = pendingSeekMsRef.current
            if (restoreMs != null && restoreMs > 0) {
                pendingSeekMsRef.current = null
                engine.seek(restoreMs)
                setPositionMs(restoreMs)
                lastTickPosRef.current = restoreMs
            } else {
                setPositionMs(0)
                lastTickPosRef.current = 0
            }
            setDurationMs(track.durationMs)

            if (cancelled || gen !== loadGenRef.current) {
                return
            }

            mediaReadyRef.current = true
            // 若装载期间用户已暂停，保持停；否则由 resume effect 统一 play
            if (!isPlayingRef.current) {
                hardStopEngines()
                fadeRef.current.setGain(1)
                applyUserVolume()
            } else {
                fadeRef.current.setGain(0)
            }
            setReadyEpoch((value) => value + 1)
        })()

        return () => {
            cancelled = true
        }
    }, [
        applyUserVolume,
        beginSession,
        currentTrack,
        currentTrackId,
        enginesReadyToken,
        hardStopEngines,
        reloadNonce,
        engineEpoch,
    ])

    useEffect(() => {
        applyUserVolume()
    }, [applyUserVolume, volume, isMuted])

    // 唯一 play/pause 入口（装载完成后由 readyEpoch 触发）
    useEffect(() => {
        if (!isPlaying) {
            hardStopEngines()
            return
        }

        const engine = activeRef.current
        if (!engine || !mediaReadyRef.current || !loadedTrackIdRef.current) {
            return
        }

        const gen = ++pauseGenRef.current
        let cancelled = false
        const trackId = loadedTrackIdRef.current

        void (async () => {
            try {
                if (fadeRef.current.getGain() < 0.05) {
                    fadeRef.current.setGain(0)
                }
                await engine.play()
                if (
                    cancelled ||
                    gen !== pauseGenRef.current ||
                    !isPlayingRef.current ||
                    loadedTrackIdRef.current !== trackId
                ) {
                    if (!isPlayingRef.current) {
                        hardStopEngines()
                    } else {
                        engine.pause()
                    }
                    return
                }
                await fadeRef.current.fadeTo(1, resolveFadeDurationMs())
                if (
                    !isPlayingRef.current ||
                    gen !== pauseGenRef.current ||
                    loadedTrackIdRef.current !== trackId
                ) {
                    hardStopEngines()
                }
            } catch (error) {
                if (cancelled || gen !== pauseGenRef.current) {
                    return
                }
                // 原生 play 失败 → 同曲 H5 一次
                const html5 = html5Ref.current
                const track = queueRef.current[indexRef.current]
                if (
                    html5 &&
                    track &&
                    engine !== html5 &&
                    isPlayingRef.current
                ) {
                    console.warn(
                        "[player] native play failed, fallback H5",
                        formatInvokeError(error),
                    )
                    try {
                        engine.pause()
                        const fallbackUrl = await resolvePlayableUrl(track)
                        if (
                            !fallbackUrl ||
                            cancelled ||
                            gen !== pauseGenRef.current ||
                            !isPlayingRef.current
                        ) {
                            isPlayingRef.current = false
                            hardStopEngines()
                            setIsPlaying(false)
                            return
                        }
                        activeRef.current = html5
                        setEngineStatus("degraded")
                        engineStatusRef.current = "degraded"
                        html5.load(fallbackUrl)
                        mediaReadyRef.current = true
                        applyUserVolume()
                        fadeRef.current.setGain(0)
                        await html5.play()
                        if (
                            cancelled ||
                            gen !== pauseGenRef.current ||
                            !isPlayingRef.current
                        ) {
                            hardStopEngines()
                            return
                        }
                        await fadeRef.current.fadeTo(1, resolveFadeDurationMs())
                        return
                    } catch (fallbackError) {
                        console.warn(
                            "[player] h5 fallback failed",
                            formatInvokeError(fallbackError),
                        )
                    }
                }
                console.warn("[player] resume failed", formatInvokeError(error))
                isPlayingRef.current = false
                hardStopEngines()
                setIsPlaying(false)
            }
        })()

        return () => {
            cancelled = true
            pauseGenRef.current += 1
            fadeRef.current.cancel()
        }
    }, [isPlaying, readyEpoch, hardStopEngines, applyUserVolume])

    const playTrack = useCallback((track: Track, nextQueue?: Track[]) => {
        const list = nextQueue && nextQueue.length > 0 ? nextQueue : [track]
        const index = list.findIndex((item) => item.id === track.id)
        loadedTrackIdRef.current = null
        mediaReadyRef.current = false
        setQueue(list)
        setCurrentIndex(index >= 0 ? index : 0)
        setPositionMs(0)
        setDurationMs(track.durationMs)
        isPlayingRef.current = true
        setIsPlaying(true)
    }, [])

    const playOrToggle = useCallback(
        (track: Track, nextQueue?: Track[]) => {
            const current = queueRef.current[indexRef.current]
            if (current?.id === track.id) {
                if (
                    !mediaReadyRef.current ||
                    loadedTrackIdRef.current !== track.id
                ) {
                    isPlayingRef.current = true
                    setIsPlaying(true)
                    loadedTrackIdRef.current = null
                    mediaReadyRef.current = false
                    setReloadNonce((value) => value + 1)
                    return
                }
                setPlaying(!isPlayingRef.current)
                return
            }
            playTrack(track, nextQueue)
        },
        [playTrack, setPlaying],
    )

    const reloadCurrent = useCallback(() => {
        loadedTrackIdRef.current = null
        mediaReadyRef.current = false
        setReloadNonce((value) => value + 1)
    }, [])

    const togglePlay = useCallback(() => {
        if (!currentTrack) {
            return
        }
        // 媒体尚未装载时 先触发 reload 再播，避免只切 isPlaying 空转
        if (!mediaReadyRef.current || loadedTrackIdRef.current !== currentTrack.id) {
            isPlayingRef.current = true
            setIsPlaying(true)
            loadedTrackIdRef.current = null
            mediaReadyRef.current = false
            setReloadNonce((value) => value + 1)
            return
        }
        setPlaying(!isPlayingRef.current)
    }, [currentTrack, setPlaying])

    const next = useCallback(() => {
        advance(1)
    }, [advance])

    const previous = useCallback(() => {
        if (positionMs > 3000) {
            activeRef.current?.seek(0)
            setPositionMs(0)
            return
        }
        advance(-1)
    }, [advance, positionMs])

    const seek = useCallback((nextPosition: number) => {
        activeRef.current?.seek(nextPosition)
        setPositionMs(nextPosition)
        lastTickPosRef.current = nextPosition
        lastSessionWriteRef.current = 0
    }, [])

    const setVolume = useCallback((nextVolume: number) => {
        const clamped = Math.min(1, Math.max(0, nextVolume))
        volumeRef.current = clamped
        if (clamped > 0 && mutedRef.current) {
            mutedRef.current = false
            setIsMuted(false)
        }
        // 同步落引擎，避免只靠 effect 一帧延迟 + 重渲 thrash
        const engine = activeRef.current
        if (engine) {
            const gain = fadeRef.current.getGain()
            const linear = mutedRef.current ? 0 : clamped
            engine.setVolume(linear * linear * gain)
        }
        setVolumeState(clamped)
    }, [])

    const toggleMute = useCallback(() => {
        setIsMuted((value) => !value)
    }, [])

    const toggleShuffle = useCallback(() => {
        setShuffle((value) => !value)
    }, [])

    const cycleRepeat = useCallback(() => {
        setRepeat((value) => {
            if (value === "off") {
                return "all"
            }
            if (value === "all") {
                return "one"
            }
            return "off"
        })
    }, [])

    const value = useMemo<PlayerContextValue>(
        () => ({
            queue,
            currentIndex,
            isPlaying,
            positionMs,
            durationMs,
            volume,
            isMuted,
            shuffle,
            repeat,
            currentTrack,
            engineStatus,
            playTrack,
            playOrToggle,
            reloadCurrent,
            togglePlay,
            next,
            previous,
            seek,
            setVolume,
            toggleMute,
            toggleShuffle,
            cycleRepeat,
        }),
        [
            queue,
            currentIndex,
            isPlaying,
            positionMs,
            durationMs,
            volume,
            isMuted,
            shuffle,
            repeat,
            currentTrack,
            engineStatus,
            playTrack,
            playOrToggle,
            reloadCurrent,
            togglePlay,
            next,
            previous,
            seek,
            setVolume,
            toggleMute,
            toggleShuffle,
            cycleRepeat,
        ],
    )

    return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerContextValue {
    const context = useContext(PlayerContext)
    if (!context) {
        throw new Error("usePlayer must be used within PlayerProvider")
    }
    return context
}