import { useEffect, useState } from "react"

import { usePlayer } from "@/hooks/use-player"
import {
    TITLE_BAR_DOUBLE_CLICK_OPTIONS,
    getTitleBarDoubleClickAction,
    setTitleBarDoubleClickAction,
} from "@/lib/app/title-bar-prefs"
import {
    notifyError,
    notifyInfo,
    notifySuccess,
    notifyWarning,
} from "@/lib/notify"
import {
    ENGINE_PREF_OPTIONS,
    getEnginePref,
    labelForEngineStatus,
    labelForNativeBackend,
    setEnginePref,
    type EnginePref,
} from "@/lib/player/engine-policy"
import {
    FADE_MS_MAX,
    FADE_MS_MIN,
    FADE_MS_STEP,
    getFadePrefs,
    setFadeDurationMs,
    setFadeEnabled,
} from "@/lib/player/fade-prefs"
import {
    detectFfmpeg,
    pickFfmpegExecutable,
    setFfmpegPath,
    type FfmpegStatus,
} from "@/lib/player/ffmpeg"
import {
    getPlayerPreferences,
    setShowLyricTranslation,
    setStartupAutoPlay,
} from "@/lib/player/playback-prefs"
import { EqEditor } from "@/components/music/eq-editor"
import {
    getAudioOutputMode,
    listAudioDevices,
    setAudioDevice,
    setAudioExclusive,
    type AudioDeviceInfo,
    type AudioOutputMode,
} from "@/lib/player/native-bridge"
import {
    ActionButton,
    ChoiceChip,
    ChoiceRow,
    ChipRow,
    SettingsGroup,
    SliderField,
    SwitchRow,
    TabHeader,
} from "@/pages/settings/settings-ui"
import { cn } from "@/lib/utils"
import { isWebMode } from "@/lib/web-mode"

function formatSettingsError(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === "string") {
        return error
    }
    return "未知错误"
}

function PlaybackTab() {
    const { currentTrack, engineStatus, reloadCurrent } = usePlayer()
    const [enginePref, setEnginePrefState] = useState<EnginePref>(() =>
        getEnginePref(),
    )
    const [fadeEnabled, setFadeEnabledState] = useState(
        () => getFadePrefs().enabled,
    )
    const [fadeMs, setFadeMsState] = useState(() => getFadePrefs().durationMs)
    const [autoPlayOnStartup, setAutoPlayOnStartup] = useState(
        () => getPlayerPreferences().autoPlayOnStartup,
    )
    const [showLyricTranslation, setShowLyricTranslationState] = useState(
        () => getPlayerPreferences().showLyricTranslation,
    )
    const [titleBarDoubleClick, setTitleBarDoubleClickState] = useState(() =>
        getTitleBarDoubleClickAction(),
    )
    const [devices, setDevices] = useState<AudioDeviceInfo[]>([])
    const [audioMode, setAudioMode] = useState<AudioOutputMode | null>(null)
    const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null)
    const [ffmpegBusy, setFfmpegBusy] = useState(false)
    const nativeBackendLabel = labelForNativeBackend(audioMode?.backend)

    useEffect(() => {
        let cancelled = false
        void Promise.all([listAudioDevices(), getAudioOutputMode()]).then(
            ([nextDevices, mode]) => {
                if (cancelled) {
                    return
                }
                setDevices(nextDevices)
                setAudioMode(mode)
            },
        )
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        void detectFfmpeg().then((status) => {
            if (!cancelled) {
                setFfmpegStatus(status)
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function refreshFfmpeg() {
        setFfmpegBusy(true)
        try {
            const status = await detectFfmpeg()
            setFfmpegStatus(status)
            if (status.available) {
                notifySuccess("已发现 FFmpeg", {
                    description: status.path ?? undefined,
                })
            } else {
                notifyWarning("未发现 FFmpeg", {
                    description: status.error ?? undefined,
                })
            }
        } catch (error) {
            notifyError("FFmpeg 检测失败", {
                description: formatSettingsError(error),
            })
        } finally {
            setFfmpegBusy(false)
        }
    }

    async function chooseFfmpeg() {
        setFfmpegBusy(true)
        try {
            const path = await pickFfmpegExecutable()
            if (!path) {
                return
            }
            const status = await setFfmpegPath(path)
            setFfmpegStatus(status)
            notifySuccess("FFmpeg 已配置", {
                description: status.path ?? path,
            })
        } catch (error) {
            notifyError("FFmpeg 配置无效", {
                description: formatSettingsError(error),
            })
        } finally {
            setFfmpegBusy(false)
        }
    }

    async function clearFfmpeg() {
        setFfmpegBusy(true)
        try {
            const status = await setFfmpegPath(null)
            setFfmpegStatus(status)
            notifyInfo("已清除手动路径", {
                description: status.available
                    ? "已恢复环境自动发现"
                    : undefined,
            })
        } catch (error) {
            notifyError("清除 FFmpeg 配置失败", {
                description: formatSettingsError(error),
            })
        } finally {
            setFfmpegBusy(false)
        }
    }

    return (
        <div className="space-y-3">
            <TabHeader title="播放" description="引擎、输出设备、歌词与播放行为" />

            {/* 播放行为：整卡置于顶部，不用分组组件 */}
            <div className="material-surface flex flex-col gap-3 rounded-2xl px-4 py-3.5">
                <p className="text-[15px] font-semibold tracking-[-0.01em]">
                    播放行为
                </p>
                <SwitchRow
                    title="启动时自动播放"
                    description="打开应用后自动播放上次队列"
                    checked={autoPlayOnStartup}
                    onCheckedChange={(checked) => {
                        setStartupAutoPlay(checked)
                        setAutoPlayOnStartup(checked)
                    }}
                />
                <SwitchRow
                    title="播放淡入淡出"
                    description="暂停、恢复与切歌时平滑音量"
                    checked={fadeEnabled}
                    onCheckedChange={(checked) => {
                        setFadeEnabled(checked)
                        setFadeEnabledState(checked)
                    }}
                />
                <SliderField
                    label="淡入淡出时长"
                    display={`${fadeMs} ms`}
                    min={FADE_MS_MIN}
                    max={FADE_MS_MAX}
                    step={FADE_MS_STEP}
                    value={fadeMs}
                    disabled={!fadeEnabled}
                    onChange={(next) => {
                        setFadeDurationMs(next)
                        setFadeMsState(next)
                    }}
                />
                <ChoiceRow label="双击标题栏">
                    {TITLE_BAR_DOUBLE_CLICK_OPTIONS.map((option) => (
                        <ChoiceChip
                            key={option.id}
                            label={option.label}
                            active={titleBarDoubleClick === option.id}
                            onClick={() => {
                                setTitleBarDoubleClickState(option.id)
                                setTitleBarDoubleClickAction(option.id)
                            }}
                        />
                    ))}
                </ChoiceRow>
                <SwitchRow
                    title="启用翻译歌词"
                    description="原文歌词下方一起显示翻译"
                    checked={showLyricTranslation}
                    onCheckedChange={(checked) => {
                        setShowLyricTranslation(checked)
                        setShowLyricTranslationState(checked)
                    }}
                />
            </div>

            {/* 音频输出：独占整卡 */}
            <SettingsGroup title="音频输出" description="引擎、设备与解码">
                {!isWebMode() ? (
                    <ChoiceRow label="播放引擎">
                        {ENGINE_PREF_OPTIONS.map((option) => (
                            <ChoiceChip
                                key={option.id}
                                label={option.label}
                                active={enginePref === option.id}
                                onClick={() => {
                                    setEnginePref(option.id)
                                    setEnginePrefState(option.id)
                                }}
                            />
                        ))}
                    </ChoiceRow>
                ) : null}
                {!isWebMode() ? (
                    <p className="text-[13px] text-muted-foreground">
                        当前：{labelForEngineStatus(engineStatus, audioMode?.backend)}
                        {audioMode?.note ? ` · ${audioMode.note}` : ""} ·
                        无损/高规格本地走{nativeBackendLabel}，在线与普通
                        mp3 走 H5；切换后下次启动播放会话生效
                    </p>
                ) : null}
                <div className="space-y-2">
                    <p className="text-[15px] font-medium">输出设备</p>
                    <ChipRow>
                        {devices.map((device) => (
                            <ChoiceChip
                                key={device.id}
                                label={device.name}
                                active={
                                    (audioMode?.deviceId ?? "default") ===
                                    device.id
                                }
                                onClick={() => {
                                    void setAudioDevice(device.id)
                                        .then(() =>
                                            getAudioOutputMode().then(
                                                setAudioMode,
                                            ),
                                        )
                                        .catch((error: unknown) => {
                                            notifyError("切换输出设备失败", {
                                                description:
                                                    error instanceof Error
                                                        ? error.message
                                                        : "请重试",
                                            })
                                        })
                                }}
                            />
                        ))}
                    </ChipRow>
                </div>
                {audioMode?.supportsExclusive ? (
                    <ChoiceRow
                        label="WASAPI 独占"
                        description={
                            audioMode.exclusive
                                ? "已开启（设备支持时生效）"
                                : "共享模式（当前）"
                        }
                    >
                        <ChoiceChip
                            label={
                                audioMode.exclusive ? "独占开" : "独占关"
                            }
                            active={audioMode.exclusive}
                            onClick={() => {
                                const next = !audioMode.exclusive
                                void setAudioExclusive(next)
                                    .then(() => {
                                        // 切换独占会重建原生输出流，本地曲目续播当前，
                                        // 避免播放中断但界面仍显示在播
                                        if (currentTrack?.source === "local") {
                                            reloadCurrent()
                                        }
                                        return getAudioOutputMode().then(
                                            setAudioMode,
                                        )
                                    })
                                    .catch((error: unknown) => {
                                        notifyError(
                                            next
                                                ? "独占模式开启失败"
                                                : "独占模式关闭失败",
                                            {
                                                description:
                                                    error instanceof Error
                                                        ? error.message
                                                        : "设备可能不支持，请重试",
                                            },
                                        )
                                    })
                            }}
                        />
                    </ChoiceRow>
                ) : null}
                <div className="space-y-2">
                    <p className="text-[15px] font-medium">FFmpeg 解码器</p>
                    <p className="text-[13px] text-muted-foreground">
                        仅在内置解码器不支持格式时调用，输出 32-bit 浮点
                        PCM 并保留源采样率
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={cn(
                                "rounded-full px-2.5 py-1 text-[13px] font-medium",
                                ffmpegStatus?.available
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "bg-[var(--surface-fill)] text-muted-foreground",
                            )}
                        >
                            {ffmpegStatus?.available ? "可用" : "未配置"}
                        </span>
                        <ActionButton
                            disabled={ffmpegBusy}
                            onClick={() => void refreshFfmpeg()}
                        >
                            自动检测
                        </ActionButton>
                        <ActionButton
                            variant="primary"
                            disabled={ffmpegBusy}
                            onClick={() => void chooseFfmpeg()}
                        >
                            选择文件
                        </ActionButton>
                        {ffmpegStatus?.source === "configured" ? (
                            <ActionButton
                                variant="ghost"
                                disabled={ffmpegBusy}
                                onClick={() => void clearFfmpeg()}
                            >
                                清除
                            </ActionButton>
                        ) : null}
                        {ffmpegStatus?.path ? (
                            <span
                                className="max-w-full truncate font-mono text-[13px] text-muted-foreground"
                                title={ffmpegStatus.path}
                            >
                                {ffmpegStatus.path}
                            </span>
                        ) : (
                            <span className="text-[13px] text-muted-foreground">
                                {ffmpegStatus?.error ?? "正在检测…"}
                            </span>
                        )}
                    </div>
                </div>
            </SettingsGroup>

            {/* 均衡器：独占整卡 */}
            <SettingsGroup title="均衡器" description="10 段参数均衡，实时生效">
                <EqEditor />
            </SettingsGroup>
        </div>
    )
}

export { PlaybackTab }
