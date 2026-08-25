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

import { hasAndroidAudio } from "@/lib/android/native-bridge"
import { recordPlaySessionEnd, startPlaySession } from "@/lib/db/play-stats"
import { fileStemFromPath, stripExtension } from "@/lib/local/audio-formats"
import { LOCAL_LIBRARY_EVENT } from "@/lib/local/library-store"
import { resolvePlayableUrl } from "@/lib/music/resolve-url"
import { getNeteaseQualityBr } from "@/lib/netease/quality"
import { notifyError, notifyWarning } from "@/lib/notify"
import { isAndroid } from "@/lib/platform"
import {
    createAndroidEngine,
} from "@/lib/player/android-engine"
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
import { isFfmpegRequiredError } from "@/lib/player/ffmpeg"
import { resolveFadeDurationMs } from "@/lib/player/fade-prefs"
import { shouldUseNativeForTrack } from "@/lib/player/local-quality"
import {
    getPlayerPreferences,
    setPlayerPreferences,
} from "@/lib/player/playback-prefs"
import { setPlaybackTick } from "@/lib/player/playback-tick"
import { createNativeEngine } from "@/lib/player/native-engine"
import {
    hydrateLocalTracks,
    readPlaybackSession,
    writePlaybackSession,
} from "@/lib/player/playback-session"
import {
    applyGainToPreset,
    clearPerTrackOverride,
    deleteCustomPreset,
    readEqPrefs,
    renameCustomPreset,
    resolveEqGains,
    resolveEqGainsForTrack,
    resolveEqPresetIdForTrack,
    saveCustomPreset,
    setPerTrackEnabled,
    setPerTrackOverride,
    writeEqPrefs,
    type EqPrefs,
} from "@/lib/player/eq-prefs"
import type { PlayerSnapshot, RepeatMode, Track } from "@/lib/types"
import { isWebMode } from "@/lib/web-mode"

// 进度/时长不进 context：200ms tick 会让全应用每帧重渲；需消费方自行订阅 playback-tick
type PlayerContextValue = Omit<PlayerSnapshot, "positionMs" | "durationMs"> & {
    currentTrack: Track | null
    engineStatus: EngineStatus
    playTrack: (track: Track, queue?: Track[]) => void
    /** 同曲再点：播放中暂停 / 已暂停则继续；异曲：换队列并播 */
    playOrToggle: (track: Track, queue?: Track[]) => void
    /** 插入当前播放之后并立即播放 */
    playNext: (track: Track) => void
    /** 追加到队列末尾（不打断当前播放） */
    addToQueue: (track: Track) => void
    removeFromQueue: (index: number) => void
    jumpTo: (index: number) => void
    /** 队列内拖动排序 */
    reorderQueue: (from: number, to: number) => void
    /** 将队列内某曲移到当前曲目之后（下一首播放） */
    moveToNext: (index: number) => void
    /** 清空队列并停止 */
    clearQueue: () => void
    reloadCurrent: () => void
    togglePlay: () => void
    next: () => void
    previous: () => void
    seek: (positionMs: number) => void
    setVolume: (volume: number) => void
    toggleMute: () => void
    /** 倍速：0.5–2，1 为正常 */
    playbackRate: number
    setPlaybackRate: (rate: number) => void
    toggleShuffle: () => void
    cycleRepeat: () => void
    /** 单按钮轮换播放模式，对齐网易云：顺序、列表循环、单曲循环、随机 */
    cyclePlayMode: () => void
    eq: EqPrefs
    setEqEnabled: (enabled: boolean) => void
    applyEqPreset: (presetId: string) => void
    /**
     * 拖动频段增益。perTrack 模式下传入 trackId 作用于该歌的覆盖预设，
     * 否则作用于全局预设；内置预设拖动会克隆为新自定义再改。
     */
    setEqBandGain: (index: number, gainDb: number, trackId?: string | null) => void
    /** 保存当前全局曲线为新自定义预设并切换选中 */
    saveEqPreset: (name: string) => void
    /** 按歌曲保存当前曲线为新自定义并设为该歌覆盖 */
    saveEqPresetForTrack: (trackId: string, name: string) => void
    /** 重命名/删除当前作用目标（全局 presetId 或某歌覆盖）的预设 */
    renameEqPreset: (id: string, name: string) => void
    deleteEqPreset: (id: string) => void
    setPerTrackEqEnabled: (enabled: boolean) => void
    setTrackEqPreset: (trackId: string, presetId: string) => void
    clearTrackEqPreset: (trackId: string) => void
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
        return "无法播放"
    }
}

// 技术错误转成用户短句，不暴露引擎名
function friendlyPlayError(error: unknown, trackTitle?: string): string {
    const raw = formatInvokeError(error).toLowerCase()
    const prefix = trackTitle ? `${trackTitle} · ` : ""
    if (
        /decode|unsupported|format|codec|invalid|unknown|not support|无法|失败|no such|eof|probe/.test(
            raw,
        )
    ) {
        return `${prefix}此格式暂时无法播放`
    }
    if (/permission|access|denied|找不到|not found|no such file/.test(raw)) {
        return `${prefix}文件不可用`
    }
    if (/timeout|超时/.test(raw)) {
        return `${prefix}加载超时`
    }
    const original = formatInvokeError(error)
    if (/[\u4e00-\u9fff]/.test(original) && original.length < 80) {
        return trackTitle ? `${trackTitle} · ${original}` : original
    }
    return `${prefix}暂时无法播放`
}

function sessionFileName(track: { fileName?: string; filePath?: string }): string | null {
    if (track.fileName?.trim()) {
        return stripExtension(track.fileName.trim()) || null
    }
    return fileStemFromPath(track.filePath ?? null)
}

export function PlayerProvider({ children }: { children: ReactNode }) {
    const restored = useMemo(() => readPlaybackSession(), [])
    const playerPrefs = useMemo(() => getPlayerPreferences(), [])

    const [queue, setQueue] = useState<Track[]>(() => restored?.queue ?? [])
    const [currentIndex, setCurrentIndex] = useState(
        () => restored?.currentIndex ?? -1,
    )
    // 浏览器自动播放策略会拦截无用户交互的 play()：网页版恢复会话时保持暂停，
    // 由用户首次点击播放（此后即可正常连播）。
    const [isPlaying, setIsPlaying] = useState(
        () =>
            Boolean(
                !isWebMode() &&
                    playerPrefs.autoPlayOnStartup &&
                    restored?.queue.length,
            ),
    )
    const [positionMs, setPositionMs] = useState(
        () => restored?.positionMs ?? 0,
    )
    const [durationMs, setDurationMs] = useState(() => {
        const track = restored?.queue[restored.currentIndex]
        return track?.durationMs ?? 0
    })
    const [volume, setVolumeState] = useState(() => playerPrefs.volume)
    const [reloadNonce, setReloadNonce] = useState(0)
    const [isMuted, setIsMuted] = useState(() => playerPrefs.isMuted)
    const [playbackRate, setPlaybackRateState] = useState(
        () => playerPrefs.playbackRate,
    )
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
    const [eq, setEq] = useState<EqPrefs>(() => readEqPrefs())
    const eqRef = useRef(eq)

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
    const playbackRateRef = useRef(playbackRate)
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
    /** seek 后短窗忽略过期 tick，避免进度条回跳/时长闪烁 */
    const seekGuardUntilRef = useRef(0)
    const seekSeqRef = useRef(0)
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
        playbackRateRef.current = playbackRate
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
        playbackRate,
        positionMs,
        durationMs,
        engineStatus,
    ])

    useEffect(() => {
        try {
            setPlayerPreferences({ volume, isMuted, playbackRate })
        } catch {
            // 偏好写入失败不影响当前播放
        }
    }, [volume, isMuted, playbackRate])

    // 进度/时长同步到独立 tick store；store 去重后通知订阅方（进度条/歌词），
    // 不再触发 PlayerContext 换引用，避免无关组件每 200ms 重渲
    useEffect(() => {
        setPlaybackTick({ positionMs, durationMs })
    }, [positionMs, durationMs])

    useEffect(() => {
        function refreshLocalQueueMetadata() {
            setQueue((current) => hydrateLocalTracks(current))
        }
        window.addEventListener(LOCAL_LIBRARY_EVENT, refreshLocalQueueMetadata)
        return () =>
            window.removeEventListener(LOCAL_LIBRARY_EVENT, refreshLocalQueueMetadata)
    }, [])

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

    const setEqEnabled = useCallback((enabled: boolean) => {
        setEq((prev) => {
            const next = { ...prev, enabled }
            writeEqPrefs(next)
            return next
        })
    }, [])

    const applyEqPreset = useCallback((presetId: string) => {
        setEq((prev) => {
            const next = { ...prev, presetId }
            writeEqPrefs(next)
            return next
        })
    }, [])

    /**
     * 拖动频段增益：perTrack 且有 trackId 时作用于该歌覆盖预设（懒克隆内置），
     * 否则作用于全局预设。applyGainToPreset 统一处理「内置克隆/自定义就地改」。
     * 返回后写回 localStorage。
     */
    const setEqBandGain = useCallback(
        (index: number, gainDb: number, trackId?: string | null) => {
            setEq((prev) => {
                if (prev.perTrackEnabled && trackId) {
                    // 该歌当前生效预设：有覆盖用覆盖，否则跟随全局
                    const presetId = resolveEqPresetIdForTrack(prev, trackId)
                    const { prefs, presetId: targetId } = applyGainToPreset(
                        prev,
                        presetId,
                        index,
                        gainDb,
                    )
                    // 始终把该歌覆盖指向作用后的预设（含内置懒克隆出的新自定义）
                    const next = setPerTrackOverride(prefs, trackId, targetId)
                    writeEqPrefs(next)
                    return next
                }
                const { prefs, presetId } = applyGainToPreset(
                    prev,
                    prev.presetId,
                    index,
                    gainDb,
                )
                const next = { ...prefs, presetId }
                writeEqPrefs(next)
                return next
            })
        },
        [],
    )

    const saveEqPreset = useCallback((name: string) => {
        setEq((prev) => {
            const next = saveCustomPreset(prev, name, resolveEqGains(prev))
            writeEqPrefs(next)
            return next
        })
    }, [])

    const saveEqPresetForTrack = useCallback((trackId: string, name: string) => {
        setEq((prev) => {
            // 以该歌当前生效曲线为准，存为新自定义并设为该歌覆盖（保存后返回 prefs 已带新 presetId）
            const gains = resolveEqGainsForTrack(prev, trackId)
            const withPreset = saveCustomPreset(prev, name, gains)
            const next = setPerTrackOverride(
                withPreset,
                trackId,
                withPreset.presetId,
            )
            writeEqPrefs(next)
            return next
        })
    }, [])

    const renameEqPreset = useCallback((id: string, name: string) => {
        setEq((prev) => {
            const next = renameCustomPreset(prev, id, name)
            writeEqPrefs(next)
            return next
        })
    }, [])

    const deleteEqPreset = useCallback((id: string) => {
        setEq((prev) => {
            const next = deleteCustomPreset(prev, id)
            writeEqPrefs(next)
            return next
        })
    }, [])

    const setPerTrackEqEnabled = useCallback((enabled: boolean) => {
        setEq((prev) => {
            const next = setPerTrackEnabled(prev, enabled)
            writeEqPrefs(next)
            return next
        })
    }, [])

    const setTrackEqPreset = useCallback((trackId: string, presetId: string) => {
        setEq((prev) => {
            const next = setPerTrackOverride(prev, trackId, presetId)
            writeEqPrefs(next)
            return next
        })
    }, [])

    const clearTrackEqPreset = useCallback((trackId: string) => {
        setEq((prev) => {
            const next = clearPerTrackOverride(prev, trackId)
            writeEqPrefs(next)
            return next
        })
    }, [])

    /** 双引擎都 pause，不改 fade / pauseGen；切 H5↔原生引擎时用 */
    const pauseBothEngines = useCallback(() => {
        html5Ref.current?.pause()
        nativeRef.current?.pause()
        if (
            activeRef.current &&
            activeRef.current !== html5Ref.current &&
            activeRef.current !== nativeRef.current
        ) {
            activeRef.current.pause()
        }
    }, [])

    /** 立即静音停引擎；与 isPlaying 状态无关，供用户暂停 / 竞态收尾 */
    const hardStopEngines = useCallback(() => {
        pauseGenRef.current += 1
        fadeRef.current.cancel()
        fadeRef.current.setGain(0)
        pauseBothEngines()
        applyUserVolume()
    }, [applyUserVolume, pauseBothEngines])

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
        const fileName = sessionFileName(track)
        void recordPlaySessionEnd({
            id: sessionId,
            trackId: track.id,
            source: track.source,
            startedAt: sessionStartedAtRef.current,
            endedAt: Date.now(),
            listenedMs,
            completed,
            qualityBr: track.source === "netease" ? getNeteaseQualityBr() : null,
            title: track.title,
            artist: track.artist,
            album: track.album,
            filePath: track.filePath ?? null,
            fileName,
            contentHash: track.contentHash ?? null,
            coverUrl: track.coverUrl || null,
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
            const fileName = sessionFileName(track)
            void startPlaySession({
                id,
                trackId: track.id,
                source: track.source,
                startedAt: sessionStartedAtRef.current,
                qualityBr: track.source === "netease" ? getNeteaseQualityBr() : null,
                title: track.title,
                artist: track.artist,
                album: track.album,
                filePath: track.filePath ?? null,
                fileName,
                contentHash: track.contentHash ?? null,
                coverUrl: track.coverUrl || null,
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
                // seek 进行中：丢弃明显过期的旧 tick，防止进度/时长被改乱
                if (performance.now() < seekGuardUntilRef.current) {
                    const expected = lastTickPosRef.current
                    if (position + 1500 < expected) {
                        return
                    }
                }
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
            html5.setEq(resolveEqGains(eqRef.current), eqRef.current.enabled)
            nativeAvailableRef.current = false
            nativeRef.current = null

            // 仅探测并挂载 native 实例；默认显示 H5，按曲再切原生输出
            if (choice.nativeReady) {
                try {
                    nativeRef.current =
                        isAndroid() && hasAndroidAudio()
                            ? createAndroidEngine(handlers)
                            : createNativeEngine(handlers)
                    nativeAvailableRef.current = true
                    // native 引擎已集成 biquad EQ，挂载时同步当前增益
                    nativeRef.current.setEq(
                        resolveEqGains(eqRef.current),
                        eqRef.current.enabled,
                    )
                    setEngineStatus(choice.status)
                    engineStatusRef.current = choice.status
                } catch {
                    setEngineStatus(
                        getEnginePref() === "native" ? "degraded" : "html5",
                    )
                    engineStatusRef.current =
                        getEnginePref() === "native" ? "degraded" : "html5"
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

    // EQ 按当前歌曲解析后实时作用到 H5 与 native 引擎（切歌/改 EQ 都重新应用）；
    // native 引擎（rodio）已集成 biquad EQ，随增益实时刷新
    useEffect(() => {
        eqRef.current = eq
        const gains = resolveEqGainsForTrack(eq, currentTrackId)
        html5Ref.current?.setEq(gains, eq.enabled)
        nativeRef.current?.setEq(gains, eq.enabled)
    }, [eq, currentTrackId])

    // 倍速随播放曲目变化重下发：H5 load 会重置 playbackRate，原生新缓冲要重新吃到 factor
    useEffect(() => {
        playbackRateRef.current = playbackRate
        html5Ref.current?.setSpeed(playbackRate)
        nativeRef.current?.setSpeed(playbackRate)
    }, [playbackRate, currentTrackId])

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

            // 作废进行中的 resume/fade，避免旧会话 hardStop 误伤新原生会话
            pauseGenRef.current += 1
            fadeRef.current.cancel()
            // 云端 H5 → 本地原生输出：必须双停，否则旧引擎抢设备/旧 play 回调乱入
            pauseBothEngines()

            const pref = getEnginePref()
            const wantNative =
                nativeAvailableRef.current &&
                Boolean(nativeRef.current) &&
                shouldUseNativeForTrack(track, pref)

            let engine: AudioEngine = html5
            let status: EngineStatus = "html5"
            let usedNative = false

            if (wantNative) {
                engine = nativeRef.current!
                status = "native"
                usedNative = true
            } else if (pref === "native" && track.filePath && !nativeAvailableRef.current) {
                // 用户强制本地原生输出但 probe 失败
                status = "degraded"
            }

            activeRef.current = engine
            setEngineStatus(status)
            engineStatusRef.current = status
            applyUserVolume()

            const resolved =
                usedNative && track.filePath
                    ? ({ ok: true as const, url: track.filePath })
                    : await resolvePlayableUrl(track)

            if (cancelled || gen !== loadGenRef.current) {
                return
            }
            if (!resolved.ok) {
                isPlayingRef.current = false
                hardStopEngines()
                setIsPlaying(false)
                setDurationMs(track.durationMs)
                // VIP、无版权、无链接：toast，勿静默
                notifyWarning("无法播放", {
                    description: `${track.title} · ${resolved.reason}`,
                    id: `play-fail-${track.id}`,
                })
                return
            }
            const url = resolved.url

            try {
                await Promise.resolve(engine.load(url))
            } catch (error) {
                console.warn("[player] load failed", formatInvokeError(error))
                if (isFfmpegRequiredError(error)) {
                    isPlayingRef.current = false
                    hardStopEngines()
                    setIsPlaying(false)
                    notifyError("需要配置 FFmpeg", {
                        description: `${track.title} · 此格式需要外部 FFmpeg，请前往设置 > 播放完成配置`,
                        id: `ffmpeg-required-${track.id}`,
                    })
                    return
                }
                // 原生 load 失败，回退 H5 同曲
                if (usedNative && html5) {
                    pauseBothEngines()
                    activeRef.current = html5
                    setEngineStatus("degraded")
                    engineStatusRef.current = "degraded"
                    applyUserVolume()
                    const fallback = await resolvePlayableUrl(track)
                    if (!fallback.ok || cancelled || gen !== loadGenRef.current) {
                        isPlayingRef.current = false
                        hardStopEngines()
                        setIsPlaying(false)
                        if (!fallback.ok) {
                            notifyWarning("无法播放", {
                                description: `${track.title} · ${fallback.reason}`,
                                id: `play-fail-${track.id}`,
                            })
                        }
                        return
                    }
                    try {
                        await Promise.resolve(html5.load(fallback.url))
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
                        notifyError("无法播放", {
                            description: friendlyPlayError(fallbackError, track.title),
                        })
                        return
                    }
                } else {
                    isPlayingRef.current = false
                    hardStopEngines()
                    setIsPlaying(false)
                    notifyError("无法播放", {
                        description: friendlyPlayError(error, track.title),
                    })
                    return
                }
            }

            // load 完成：只标记 ready，play 由 resume effect 统一负责
            applyUserVolume()
            // 启动恢复进度：必须 await，避免 play 抢在 seek 前从 0 起播
            const restoreMs = pendingSeekMsRef.current
            if (restoreMs != null && restoreMs > 0) {
                pendingSeekMsRef.current = null
                try {
                    await Promise.resolve(engine.seek(restoreMs, { resume: false }))
                } catch {
                    // 恢复失败仍从 0 可播
                }
                if (cancelled || gen !== loadGenRef.current) {
                    return
                }
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
        pauseBothEngines,
        reloadNonce,
        engineEpoch,
    ])

    useEffect(() => {
        applyUserVolume()
    }, [applyUserVolume, volume, isMuted])

    // 唯一 play/pause 入口，装载完成后由 readyEpoch 触发
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

        /** 仅停本 effect 捕获的引擎；切曲后 isPlaying 仍 true 时绝不能 hardStop 双引擎 */
        const abandonThisEngine = () => {
            try {
                engine.pause()
            } catch {
                // 引擎可能已销毁，收尾路径无需再管
            }
        }

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
                        abandonThisEngine()
                    }
                    return
                }
                await fadeRef.current.fadeTo(1, resolveFadeDurationMs())
                if (
                    cancelled ||
                    gen !== pauseGenRef.current ||
                    !isPlayingRef.current ||
                    loadedTrackIdRef.current !== trackId
                ) {
                    if (!isPlayingRef.current) {
                        hardStopEngines()
                    } else {
                        abandonThisEngine()
                    }
                }
            } catch (error) {
                if (cancelled || gen !== pauseGenRef.current) {
                    return
                }
                const track = queueRef.current[indexRef.current]
                if (isFfmpegRequiredError(error)) {
                    isPlayingRef.current = false
                    hardStopEngines()
                    setIsPlaying(false)
                    if (track) {
                        notifyError("需要配置 FFmpeg", {
                            description: `${track.title} · 此格式需要外部 FFmpeg，请前往设置 > 播放完成配置`,
                            id: `ffmpeg-required-${track.id}`,
                        })
                    }
                    return
                }
                // 原生 play 失败，同曲 H5 一次
                const html5 = html5Ref.current
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
                        const fallback = await resolvePlayableUrl(track)
                        if (
                            !fallback.ok ||
                            cancelled ||
                            gen !== pauseGenRef.current ||
                            !isPlayingRef.current
                        ) {
                            isPlayingRef.current = false
                            hardStopEngines()
                            setIsPlaying(false)
                            if (!fallback.ok) {
                                notifyWarning("无法播放", {
                                    description: `${track.title} · ${fallback.reason}`,
                                    id: `play-fail-${track.id}`,
                                })
                            } else {
                                notifyError("无法播放", {
                                    description: friendlyPlayError(error, track.title),
                                    id: `play-fail-${track.id}`,
                                })
                            }
                            return
                        }
                        pauseBothEngines()
                        activeRef.current = html5
                        setEngineStatus("degraded")
                        engineStatusRef.current = "degraded"
                        await Promise.resolve(html5.load(fallback.url))
                        if (
                            cancelled ||
                            gen !== pauseGenRef.current ||
                            !isPlayingRef.current
                        ) {
                            hardStopEngines()
                            return
                        }
                        mediaReadyRef.current = true
                        applyUserVolume()
                        fadeRef.current.setGain(0)
                        await html5.play()
                        if (
                            cancelled ||
                            gen !== pauseGenRef.current ||
                            !isPlayingRef.current
                        ) {
                            if (!isPlayingRef.current) {
                                hardStopEngines()
                            } else {
                                html5.pause()
                            }
                            return
                        }
                        await fadeRef.current.fadeTo(1, resolveFadeDurationMs())
                        return
                    } catch (fallbackError) {
                        console.warn(
                            "[player] h5 fallback failed",
                            formatInvokeError(fallbackError),
                        )
                        isPlayingRef.current = false
                        hardStopEngines()
                        setIsPlaying(false)
                        notifyError("无法播放", {
                            description: friendlyPlayError(
                                fallbackError,
                                track.title,
                            ),
                            id: `play-fail-${track.id}`,
                        })
                        return
                    }
                }
                console.warn("[player] resume failed", formatInvokeError(error))
                isPlayingRef.current = false
                hardStopEngines()
                setIsPlaying(false)
                if (track) {
                    notifyError("无法播放", {
                        description: friendlyPlayError(error, track.title),
                        id: `play-fail-${track.id}`,
                    })
                }
            }
        })()

        return () => {
            cancelled = true
            pauseGenRef.current += 1
            fadeRef.current.cancel()
            // 只停本会话引擎，留给 load 去启下一引擎
            abandonThisEngine()
        }
    }, [isPlaying, readyEpoch, hardStopEngines, pauseBothEngines, applyUserVolume])

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
        // 直接切上一首；不做「>3s 先重头播当前曲」的二次判定，
        // 该行为会让按一次看似只是重置进度条、要再按才切歌
        advance(-1)
    }, [advance])

    const seek = useCallback((nextPosition: number) => {
        if (!Number.isFinite(nextPosition)) {
            return
        }
        const clamped = Math.max(0, nextPosition)
        const engine = activeRef.current
        const resume =
            isPlayingRef.current &&
            mediaReadyRef.current &&
            Boolean(engine)

        // 先更新 UI，再异步落地引擎，避免 skip 时代卡死手感
        setPositionMs(clamped)
        lastTickPosRef.current = clamped
        lastSessionWriteRef.current = 0
        seekGuardUntilRef.current = performance.now() + 800

        if (!engine) {
            return
        }

        const seq = ++seekSeqRef.current
        void (async () => {
            try {
                await Promise.resolve(
                    engine.seek(clamped, { resume }),
                )
            } catch (error) {
                console.warn("[player] seek failed", formatInvokeError(error))
                return
            }
            if (seq !== seekSeqRef.current) {
                return
            }
            // 原生已按 resume 续播；无需再 play()，否则 Seek/Play 交错无法合并
            seekGuardUntilRef.current = performance.now() + 320
        })()
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

    const setPlaybackRate = useCallback((nextRate: number) => {
        const clamped = Math.min(2, Math.max(0.5, nextRate))
        playbackRateRef.current = clamped
        // 同步落引擎，避免只靠 effect 一帧延迟
        activeRef.current?.setSpeed(clamped)
        setPlaybackRateState(clamped)
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

    // 播放模式单一入口，点击依序轮换并最终回到关闭，网易云同款单按钮交互
    const cyclePlayMode = useCallback(() => {
        if (shuffle) {
            setShuffle(false)
            return
        }
        if (repeat === "off") {
            setRepeat("all")
            return
        }
        if (repeat === "all") {
            setRepeat("one")
            return
        }
        setRepeat("off")
        setShuffle(true)
    }, [shuffle, repeat])

    /** 将曲目插入当前播放之后并立即播放（"下一首播放"） */
    const playNext = useCallback((track: Track) => {
        const list = [...queueRef.current]
        const idx = indexRef.current
        if (list.length === 0 || idx < 0) {
            playTrack(track)
            return
        }
        const insertAt = Math.min(idx + 1, list.length)
        // 若曲目已在队列中，先移除旧位置，避免重复
        const existing = list.findIndex((item) => item.id === track.id)
        if (existing >= 0) {
            list.splice(existing, 1)
        }
        const target =
            existing >= 0 && existing <= insertAt ? insertAt - 1 : insertAt
        list.splice(target, 0, track)
        loadedTrackIdRef.current = null
        mediaReadyRef.current = false
        setQueue(list)
        setCurrentIndex(target)
        setPositionMs(0)
        setDurationMs(track.durationMs)
        isPlayingRef.current = true
        setIsPlaying(true)
    }, [playTrack])

    /** 追加到队列末尾（不打断当前播放） */
    const addToQueue = useCallback((track: Track) => {
        const list = [...queueRef.current]
        if (list.some((item) => item.id === track.id)) {
            return
        }
        if (list.length === 0 || indexRef.current < 0) {
            playTrack(track)
            return
        }
        setQueue([...list, track])
    }, [playTrack])

    /** 从队列移除指定索引；移除当前曲时切到同位置新曲 */
    const removeFromQueue = useCallback((index: number) => {
        const list = [...queueRef.current]
        if (index < 0 || index >= list.length) {
            return
        }
        const removingCurrent = index === indexRef.current
        list.splice(index, 1)
        if (list.length === 0) {
            loadedTrackIdRef.current = null
            mediaReadyRef.current = false
            setQueue([])
            setCurrentIndex(-1)
            setPositionMs(0)
            setDurationMs(0)
            isPlayingRef.current = false
            setIsPlaying(false)
            return
        }
        if (removingCurrent) {
            const nextIndex = Math.min(index, list.length - 1)
            loadedTrackIdRef.current = null
            mediaReadyRef.current = false
            setQueue(list)
            setCurrentIndex(nextIndex)
            setPositionMs(0)
            setDurationMs(list[nextIndex].durationMs)
            isPlayingRef.current = true
            setIsPlaying(true)
            return
        }
        setQueue(list)
        if (index < indexRef.current) {
            setCurrentIndex(indexRef.current - 1)
        }
    }, [])

    const jumpTo = useCallback((index: number) => {
        const list = queueRef.current
        if (index < 0 || index >= list.length) {
            return
        }
        loadedTrackIdRef.current = null
        mediaReadyRef.current = false
        setCurrentIndex(index)
        setPositionMs(0)
        setDurationMs(list[index].durationMs)
        isPlayingRef.current = true
        setIsPlaying(true)
    }, [])

    /** 队列内拖动排序（from→to），同步当前播放索引 */
    const reorderQueue = useCallback((from: number, to: number) => {
        const list = [...queueRef.current]
        if (
            from < 0 ||
            from >= list.length ||
            to < 0 ||
            to >= list.length ||
            from === to
        ) {
            return
        }
        const [moved] = list.splice(from, 1)
        list.splice(to, 0, moved)
        const idx = indexRef.current
        let newIndex = idx
        if (idx === from) {
            newIndex = to
        } else if (from < idx && to >= idx) {
            newIndex = idx - 1
        } else if (from > idx && to <= idx) {
            newIndex = idx + 1
        }
        setQueue(list)
        setCurrentIndex(newIndex)
    }, [])

    const clearQueue = useCallback(() => {
        loadedTrackIdRef.current = null
        mediaReadyRef.current = false
        setQueue([])
        setCurrentIndex(-1)
        setPositionMs(0)
        setDurationMs(0)
        isPlayingRef.current = false
        setIsPlaying(false)
    }, [])

    /** 将队列内某曲移到当前曲目之后，不改变正在播放的歌曲 */
    const moveToNext = useCallback((index: number) => {
        const list = [...queueRef.current]
        const current = indexRef.current
        if (current < 0 || index === current) {
            return
        }
        if (index < 0 || index >= list.length) {
            return
        }
        const [item] = list.splice(index, 1)
        const currentAfter = index < current ? current - 1 : current
        list.splice(currentAfter + 1, 0, item)
        setQueue(list)
    }, [])

    const value = useMemo<PlayerContextValue>(
        () => ({
            queue,
            currentIndex,
            isPlaying,
            volume,
            isMuted,
            shuffle,
            repeat,
            currentTrack,
            engineStatus,
            playTrack,
            playOrToggle,
            playNext,
            addToQueue,
            removeFromQueue,
            jumpTo,
            reorderQueue,
            moveToNext,
            clearQueue,
            reloadCurrent,
            togglePlay,
            next,
            previous,
            seek,
            setVolume,
            toggleMute,
            playbackRate,
            setPlaybackRate,
            toggleShuffle,
            cycleRepeat,
            cyclePlayMode,
            eq,
            setEqEnabled,
            applyEqPreset,
            setEqBandGain,
            saveEqPreset,
            saveEqPresetForTrack,
            renameEqPreset,
            deleteEqPreset,
            setPerTrackEqEnabled,
            setTrackEqPreset,
            clearTrackEqPreset,
        }),
        [
            queue,
            currentIndex,
            isPlaying,
            volume,
            isMuted,
            shuffle,
            repeat,
            currentTrack,
            engineStatus,
            playTrack,
            playOrToggle,
            playNext,
            addToQueue,
            removeFromQueue,
            jumpTo,
            reorderQueue,
            moveToNext,
            clearQueue,
            reloadCurrent,
            togglePlay,
            next,
            previous,
            seek,
            setVolume,
            toggleMute,
            playbackRate,
            setPlaybackRate,
            toggleShuffle,
            cycleRepeat,
            cyclePlayMode,
            eq,
            setEqEnabled,
            applyEqPreset,
            setEqBandGain,
            saveEqPreset,
            saveEqPresetForTrack,
            renameEqPreset,
            deleteEqPreset,
            setPerTrackEqEnabled,
            setTrackEqPreset,
            clearTrackEqPreset,
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
