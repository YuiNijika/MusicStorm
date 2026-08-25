import { useEffect, useState } from "react"

import { Section } from "@/components/music/section"
import { usePlayer } from "@/hooks/use-player"
import { useDesktopLyric } from "@/hooks/use-desktop-lyric"
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
    ChoiceChip,
    SettingsCard,
    SettingsGroup,
    SliderField,
    SwitchRow,
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
    const { engineStatus } = usePlayer()
    const { isVisible: isDesktopLyricVisible, toggle: toggleDesktopLyric } = useDesktopLyric()
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
        <Section title="播放" description="引擎、淡入淡出与输出设备">
            <div className="space-y-3">
                <SettingsGroup>
                    <SwitchRow
                        title="启动时自动播放"
                        description="打开应用后自动播放上次队列，默认关闭"
                        checked={autoPlayOnStartup}
                        onCheckedChange={(checked) => {
                            setStartupAutoPlay(checked)
                            setAutoPlayOnStartup(checked)
                        }}
                    />
                </SettingsGroup>

                <SettingsGroup title="歌词">
                    <SwitchRow
                        title="启用翻译歌词"
                        description="网易云歌曲在原文歌词下方一起显示翻译"
                        checked={showLyricTranslation}
                        onCheckedChange={(checked) => {
                            setShowLyricTranslation(checked)
                            setShowLyricTranslationState(checked)
                        }}
                    />
                    {!isWebMode() ? (
                        <SwitchRow
                            title="桌面歌词"
                            description="在桌面上显示浮动歌词窗口，可拖动位置"
                            checked={isDesktopLyricVisible}
                            onCheckedChange={toggleDesktopLyric}
                        />
                    ) : null}
                </SettingsGroup>

                <SettingsGroup
                    title="双击标题栏"
                    description="桌面端主标题栏与全屏播放器头部均生效"
                >
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                </SettingsGroup>

                {!isWebMode() ? (
                    <SettingsGroup
                        title="播放引擎"
                        description={`当前：${labelForEngineStatus(
                            engineStatus,
                            audioMode?.backend,
                        )}${audioMode?.note ? ` · ${audioMode.note}` : ""}`}
                    >
                        <div className="flex flex-wrap gap-2">
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
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            无损/高规格本地走{nativeBackendLabel}，在线与普通 mp3
                            走 H5；切换后将在下次启动播放会话时生效
                        </p>
                    </SettingsGroup>
                ) : null}

                <SettingsGroup>
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
                </SettingsGroup>

                <SettingsGroup>
                    <EqEditor />
                </SettingsGroup>

                <SettingsGroup>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                FFmpeg 解码器
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                仅在内置解码器不支持格式时调用外部 FFmpeg
                            </p>
                        </div>
                        <span
                            className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                ffmpegStatus?.available
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "bg-[var(--surface-fill)] text-muted-foreground",
                            )}
                        >
                            {ffmpegStatus?.available ? "可用" : "未配置"}
                        </span>
                    </div>
                    <div className="space-y-1 rounded-xl bg-[var(--surface-fill)] px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                        {ffmpegStatus?.path ? (
                            <p
                                className="break-all font-mono"
                                title={ffmpegStatus.path}
                            >
                                {ffmpegStatus.path}
                            </p>
                        ) : (
                            <p>
                                {ffmpegStatus?.error ?? "正在检测 FFmpeg…"}
                            </p>
                        )}
                        {ffmpegStatus?.version ? (
                            <p
                                className="truncate"
                                title={ffmpegStatus.version}
                            >
                                {ffmpegStatus.version}
                            </p>
                        ) : null}
                        {ffmpegStatus?.available ? (
                            <p>
                                {ffmpegStatus.source === "configured"
                                    ? "来源 · 手动配置"
                                    : "来源 · 环境变量 / PATH"}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={ffmpegBusy}
                            onClick={() => void refreshFfmpeg()}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-45"
                        >
                            自动检测
                        </button>
                        <button
                            type="button"
                            disabled={ffmpegBusy}
                            onClick={() => void chooseFfmpeg()}
                            className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background active:scale-[0.97] disabled:opacity-45"
                        >
                            选择文件
                        </button>
                        {ffmpegStatus?.source === "configured" ? (
                            <button
                                type="button"
                                disabled={ffmpegBusy}
                                onClick={() => void clearFfmpeg()}
                                className="h-9 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] disabled:opacity-45"
                            >
                                清除
                            </button>
                        ) : null}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        FFmpeg 输出 32-bit 浮点 PCM，并保留源采样率；共享模式下系统仍可能按设备混音格式重采样。
                    </p>
                </SettingsGroup>

                <SettingsGroup
                    title="输出设备"
                    description={`${nativeBackendLabel} 接通后可切换设备`}
                >
                    <div className="flex flex-wrap gap-2">
                        {devices.map((device) => (
                            <ChoiceChip
                                key={device.id}
                                label={device.name}
                                active={
                                    (audioMode?.deviceId ?? "default") ===
                                    device.id
                                }
                                onClick={() => {
                                    void setAudioDevice(device.id).then(() =>
                                        getAudioOutputMode().then(setAudioMode),
                                    )
                                }}
                            />
                        ))}
                    </div>
                </SettingsGroup>

                {audioMode?.supportsExclusive ? (
                    <SettingsCard
                        title="WASAPI 独占"
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
                                void setAudioExclusive(next).then(() =>
                                    getAudioOutputMode().then(setAudioMode),
                                )
                            }}
                        />
                    </SettingsCard>
                ) : null}
            </div>
        </Section>
    )
}

export { PlaybackTab }
