import { useEffect, useState, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Check, Gauge, Pencil } from "lucide-react"

import { useTheme } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { NeteaseAuthDialog } from "@/components/auth/netease-auth-dialog"
import { Section } from "@/components/music/section"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAppUpdate } from "@/hooks/use-app-update"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { CACHE_TTL_MS } from "@/lib/app/github-update"
import {
    DEVTOOLS_EVENT,
    getDevToolsEnabled,
    setDevToolsEnabled,
} from "@/lib/app/devtools-prefs"
import {
    MATERIAL_GLASS_MEMO_KEY,
    PERFORMANCE_MODE_EVENT,
    getPerformanceMode,
    setPerformanceMode,
} from "@/lib/app/performance-prefs"
import { ACCENT_OPTIONS, accentSwatch, resolveAccentHue } from "@/lib/appearance/appearance-prefs"
import {
    setPlaylistTracksView,
    setPlaylistView,
    type ViewMode,
} from "@/lib/library/layout-prefs"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import { apiCacheClear } from "@/lib/netease/api-cache"
import {
    API_SETTINGS_EVENT,
    DEFAULT_BASE_URL,
    EXTERNAL_SOURCES,
    getApiSettings,
    getNeteaseBaseUrl,
    resolveEffectiveBaseUrl,
    setApiMode,
    setExternalSource,
    speedTestApi,
    type ApiMode,
    type ExternalSourceId,
} from "@/lib/netease/api-settings"
import {
    AUTO_PURGE_EVENT,
    DEFAULT_TTL_MS,
    TTL_EVENT,
    TTL_PRESETS,
    getApiCacheAutoPurge,
    getApiCacheTtlMs,
    setApiCacheAutoPurge,
    setApiCacheTtlMs,
} from "@/lib/netease/cache-prefs"
import { probeNativeApi } from "@/lib/netease/integrated-api"
import { openNeteaseRegister } from "@/lib/netease/open-register"
import {
    QUALITY_OPTIONS,
    getNeteaseQualityBr,
    setNeteaseQualityBr,
    type QualityBr,
} from "@/lib/netease/quality"
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
    CHROME_EVENT,
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    LYRICS_ALIGNS,
    getFullPlayerChrome,
    getFullPlayerLayout,
    setFullPlayerChrome,
    setFullPlayerLayout,
    type FullPlayerChrome,
    type FullPlayerLayout,
    type LyricsAlign,
} from "@/lib/player/full-player-prefs"
import {
    detectFfmpeg,
    pickFfmpegExecutable,
    setFfmpegPath,
    type FfmpegStatus,
} from "@/lib/player/ffmpeg"
import {
    getPlayerPreferences,
    setStartupAutoPlay,
} from "@/lib/player/playback-prefs"
import {
    getAudioOutputMode,
    listAudioDevices,
    setAudioDevice,
    setAudioExclusive,
    type AudioDeviceInfo,
    type AudioOutputMode,
} from "@/lib/player/native-bridge"
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/notify"
import { openExternalUrl } from "@/lib/open-external"
import { getCloseToTray, setCloseToTray } from "@/lib/app/close-to-tray-prefs"
import {
    DEFAULT_SHORTCUTS,
    SHORTCUT_ACTIONS,
    formatShortcut,
    keydownToShortcut,
    loadGlobalShortcuts,
    updateGlobalShortcut,
    type ShortcutAction,
} from "@/lib/app/global-shortcut-prefs"
import {
    IN_APP_ACTIONS,
    getInAppShortcuts,
    keydownToInAppShortcut,
    setInAppShortcut,
    type InAppShortcutAction,
    type InAppShortcutMap,
} from "@/lib/app/in-app-shortcut-prefs"
import { getStoragePaths } from "@/lib/storage/paths"
import { extractCoverHash } from "@/lib/local/cover"
import { loadLocalLibrary } from "@/lib/local/library-store"
import { collectCoverRefHashes } from "@/lib/music/cover-overrides"
import { isMacOS, isNativeMacOS } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { readTitleBarStyle, TITLE_BAR_STORAGE_KEY, type SettingsTab } from "@/lib/app/title-bar-prefs"

const TABS: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: "外观" },
    { id: "source", label: "音源" },
    { id: "playback", label: "播放" },
    { id: "account", label: "账号" },
    { id: "update", label: "更新" },
    { id: "hotkeys", label: "快捷键" },
    { id: "other", label: "其他" },
]

type SettingsPageProps = {
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
    initialTab?: SettingsTab
}

function SettingsPage({
    titleBarStyle,
    onTitleBarStyleChange,
    initialTab,
}: SettingsPageProps) {
    const [tab, setTab] = useState<SettingsTab>(initialTab ?? "appearance")
    const [authOpen, setAuthOpen] = useState(false)

    useEffect(() => {
        if (initialTab) {
            setTab(initialTab)
        }
    }, [initialTab])

    return (
        <div className="space-y-5">
            <SegmentedControl
                items={TABS}
                value={tab}
                onChange={(id) => setTab(id as SettingsTab)}
                className="md:max-w-md"
            />

            <div
                key={tab}
                className="animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out"
            >
                {tab === "source" ? <SourceTab /> : null}
                {tab === "playback" ? <PlaybackTab /> : null}
                {tab === "account" ? (
                    <AccountTab onLogin={() => setAuthOpen(true)} />
                ) : null}
                {tab === "appearance" ? (
                    <AppearanceTab
                        titleBarStyle={titleBarStyle}
                        onTitleBarStyleChange={onTitleBarStyleChange}
                    />
                ) : null}
                {tab === "update" ? <UpdateTab /> : null}
                {tab === "hotkeys" ? <HotkeysTab /> : null}
                {tab === "other" ? <OtherTab /> : null}
            </div>

            <NeteaseAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </div>
    )
}

function SourceTab() {
    const [settings, setSettings] = useState(() => getApiSettings())
    const [customDraft, setCustomDraft] = useState(
        () => getApiSettings().customUrl || DEFAULT_BASE_URL,
    )
    const [savedHint, setSavedHint] = useState<string | null>(null)
    const [nativeHint, setNativeHint] = useState<string | null>(null)
    const [speedHint, setSpeedHint] = useState<string | null>(null)
    const [speedLoading, setSpeedLoading] = useState(false)
    const [qualityBr, setQualityBr] = useState<QualityBr>(() => getNeteaseQualityBr())

    useEffect(() => {
        function sync() {
            const next = getApiSettings()
            setSettings(next)
            if (next.source === "custom" && next.customUrl) {
                setCustomDraft(next.customUrl)
            }
        }
        window.addEventListener(API_SETTINGS_EVENT, sync)
        return () => window.removeEventListener(API_SETTINGS_EVENT, sync)
    }, [])

    useEffect(() => {
        if (settings.mode !== "integrated") {
            setNativeHint(null)
            return
        }
        let cancelled = false
        setNativeHint("正在检测内置 API…")
        void probeNativeApi().then((status) => {
            if (!cancelled) {
                setNativeHint(status.message)
            }
        })
        return () => {
            cancelled = true
        }
    }, [settings.mode])

    function flash(text: string) {
        setSavedHint(text)
        window.setTimeout(() => setSavedHint(null), 1600)
    }

    function handleMode(mode: ApiMode) {
        const next = setApiMode(mode)
        setSettings(next)
        const title = mode === "integrated" ? "已切换内置 API" : "已切换对接 API"
        flash(title)
        notifySuccess(title, {
            description:
                mode === "integrated"
                    ? "加密在应用内完成，桌面代理发请求"
                    : "将使用下方外部源",
        })
    }

    function handleSource(source: ExternalSourceId | null) {
        if (!source) {
            return
        }
        if (source === "custom") {
            const next = setExternalSource("custom", customDraft)
            setSettings(next)
            flash("已选自定义，请确认 URL 后保存")
            notifyInfo("已选自定义源", { description: "确认 URL 后点保存" })
            return
        }
        const next = setExternalSource(source)
        setSettings(next)
        flash("已切换 API 源")
        notifySuccess("已切换 API 源", {
            description:
                EXTERNAL_SOURCES.find((item) => item.id === source)?.label ?? source,
        })
    }

    function handleSaveCustom() {
        const next = setExternalSource(
            "custom",
            customDraft.trim() || DEFAULT_BASE_URL,
        )
        setSettings(next)
        const url = resolveEffectiveBaseUrl(next)
        setCustomDraft(url)
        flash("已保存自定义源")
        notifySuccess("已保存自定义源", { description: url })
    }

    async function handleSpeedTest() {
        setSpeedLoading(true)
        setSpeedHint(null)
        if (settings.mode === "integrated") {
            const status = await probeNativeApi()
            setSpeedLoading(false)
            setSpeedHint(status.ready ? "内置就绪" : status.message)
            if (!status.ready) {
                notifyError("内置 API 未就绪", { description: status.message })
            }
            return
        }
        const result = await speedTestApi(getNeteaseBaseUrl())
        setSpeedLoading(false)
        setSpeedHint(result.ok ? `${result.ms} ms` : result.message)
        if (!result.ok) {
            notifyError("测速失败", { description: result.message })
        }
    }

    const sourceLabel =
        EXTERNAL_SOURCES.find((item) => item.id === settings.source)?.label ??
        "API 源"

    return (
        <Section title="音源" description="内置 API 或对接外部 NCM 源 · 音质">
            <div className="space-y-3">
                <div className="material-panel space-y-4 rounded-[20px] px-4 py-3.5">
                    <div className="space-y-3">
                        <div>
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                API 模式
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                默认应用内置（TS 加密直连网易云）；也可对接远程 API
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <ChoiceChip
                                label="应用内置"
                                active={settings.mode === "integrated"}
                                onClick={() => handleMode("integrated")}
                            />
                            <ChoiceChip
                                label="对接 API"
                                active={settings.mode === "external"}
                                onClick={() => handleMode("external")}
                            />
                        </div>
                        {settings.mode === "integrated" ? (
                            <p className="text-[12px] text-muted-foreground">
                                {nativeHint ??
                                    "内置运行时：加密在应用内完成，桌面代理发请求"}
                            </p>
                        ) : null}
                    </div>

                    {settings.mode === "external" ? (
                        <div className="space-y-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
                            <div>
                                <p className="text-[13px] font-medium">外部 API 源</p>
                                <p className="mt-0.5 text-[12px] text-muted-foreground">
                                    官方 / 社区预设，或自定义 Base URL
                                </p>
                            </div>
                            <Select
                                value={settings.source}
                                onValueChange={(value) =>
                                    handleSource(value as ExternalSourceId | null)
                                }
                            >
                                <SelectTrigger className="h-9 w-full min-w-[240px] max-w-md rounded-xl">
                                    <SelectValue placeholder={sourceLabel}>
                                        {sourceLabel}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {EXTERNAL_SOURCES.map((preset) => (
                                        <SelectItem
                                            key={preset.id}
                                            value={preset.id}
                                        >
                                            {preset.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {settings.source === "custom" ? (
                                <div className="space-y-2">
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        自定义 URL
                                    </p>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <input
                                            value={customDraft}
                                            onChange={(event) =>
                                                setCustomDraft(
                                                    event.currentTarget.value,
                                                )
                                            }
                                            placeholder={DEFAULT_BASE_URL}
                                            className="material-field h-9 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSaveCustom}
                                            className="h-9 shrink-0 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background active:scale-[0.97]"
                                        >
                                            保存
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="truncate text-[12px] text-muted-foreground">
                                    {getNeteaseBaseUrl()}
                                </p>
                            )}
                        </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
                        <button
                            type="button"
                            disabled={speedLoading}
                            onClick={() => void handleSpeedTest()}
                            className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium active:scale-[0.97] disabled:opacity-50 dark:bg-white/[0.08]"
                        >
                            {speedLoading
                                ? "检测中"
                                : settings.mode === "integrated"
                                  ? "检测内置"
                                  : "测速"}
                        </button>
                        {speedHint ? (
                            <span className="text-[12px] text-muted-foreground">
                                {speedHint}
                            </span>
                        ) : null}
                        {savedHint ? (
                            <span className="text-[12px] text-muted-foreground">
                                {savedHint}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">网易云音质</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            不可用时自动降级
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {QUALITY_OPTIONS.map((option) => (
                            <ChoiceChip
                                key={option.br}
                                label={option.label}
                                active={qualityBr === option.br}
                                onClick={() => {
                                    setNeteaseQualityBr(option.br)
                                    setQualityBr(option.br)
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </Section>
    )
}

function formatSettingsError(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === "string") {
        return error
    }
    return "未知错误"
}

function collectCoverKeepHashes(): string[] {
    const hashes = new Set<string>()
    try {
        const lib = loadLocalLibrary()
        for (const album of lib.albums) {
            const hash = extractCoverHash(album.coverDataUrl)
            if (hash) {
                hashes.add(hash)
            }
        }
        for (const artist of lib.artists) {
            const hash = extractCoverHash(artist.coverDataUrl)
            if (hash) {
                hashes.add(hash)
            }
        }
    } catch {
        // 库读取失败时不保留专辑封面
    }
    for (const hash of collectCoverRefHashes()) {
        hashes.add(hash)
    }
    return [...hashes]
}

function PlaybackTab() {
    const { engineStatus } = usePlayer()
    const [enginePref, setEnginePrefState] = useState<EnginePref>(() => getEnginePref())
    const [fadeEnabled, setFadeEnabledState] = useState(() => getFadePrefs().enabled)
    const [fadeMs, setFadeMsState] = useState(() => getFadePrefs().durationMs)
    const [autoPlayOnStartup, setAutoPlayOnStartup] = useState(
        () => getPlayerPreferences().autoPlayOnStartup,
    )
    const [closeToTray, setCloseToTrayState] = useState(() =>
        getCloseToTray(),
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
                description: status.available ? "已恢复环境自动发现" : undefined,
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
                <div className="material-panel flex items-center justify-between gap-3 rounded-[20px] px-4 py-3.5">
                    <div className="min-w-0">
                        <p className="text-[14px] font-medium tracking-[-0.01em]">
                            启动时自动播放
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            打开应用后自动播放上次队列，默认关闭
                        </p>
                    </div>
                    <Switch
                        checked={autoPlayOnStartup}
                        onCheckedChange={(checked) => {
                            setStartupAutoPlay(checked)
                            setAutoPlayOnStartup(checked)
                        }}
                    />
                </div>

                <div className="material-panel flex items-center justify-between gap-3 rounded-[20px] px-4 py-3.5">
                    <div className="min-w-0">
                        <p className="text-[14px] font-medium tracking-[-0.01em]">
                            {isMacOS()
                                ? "关闭窗口后保留在菜单栏"
                                : "关闭窗口时最小化到托盘"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {isMacOS()
                                ? "关闭后音乐继续播放；点击 Dock 或菜单栏图标恢复，⌘Q 退出"
                                : "关闭后音乐继续播放，从系统托盘可恢复；退出请用托盘菜单"}
                        </p>
                    </div>
                    <Switch
                        checked={closeToTray}
                        onCheckedChange={(checked) => {
                            setCloseToTrayState(checked)
                            void setCloseToTray(checked)
                        }}
                    />
                </div>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">播放引擎</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            当前：{labelForEngineStatus(engineStatus, audioMode?.backend)}
                            {audioMode?.note ? ` · ${audioMode.note}` : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            无损/高规格本地走{nativeBackendLabel}，在线与普通 mp3 走 H5
                        </p>
                    </div>
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
                        切换后将在下次启动播放会话时生效
                    </p>
                </div>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                播放淡入淡出
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                暂停、恢复与切歌时平滑音量
                            </p>
                        </div>
                        <Switch
                            checked={fadeEnabled}
                            onCheckedChange={(checked) => {
                                setFadeEnabled(checked)
                                setFadeEnabledState(checked)
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={FADE_MS_MIN}
                            max={FADE_MS_MAX}
                            step={FADE_MS_STEP}
                            disabled={!fadeEnabled}
                            value={fadeMs}
                            onChange={(event) => {
                                const next = Number(event.currentTarget.value)
                                setFadeDurationMs(next)
                                setFadeMsState(next)
                            }}
                            className="progress-range flex-1 disabled:opacity-40"
                            aria-label="淡入淡出时长"
                        />
                        <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                            {fadeMs} ms
                        </span>
                    </div>
                </div>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
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
                                    : "bg-black/[0.05] text-muted-foreground dark:bg-white/[0.08]",
                            )}
                        >
                            {ffmpegStatus?.available ? "可用" : "未配置"}
                        </span>
                    </div>
                    <div className="space-y-1 rounded-xl bg-black/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground dark:bg-white/[0.05]">
                        {ffmpegStatus?.path ? (
                            <p className="break-all font-mono" title={ffmpegStatus.path}>
                                {ffmpegStatus.path}
                            </p>
                        ) : (
                            <p>{ffmpegStatus?.error ?? "正在检测 FFmpeg…"}</p>
                        )}
                        {ffmpegStatus?.version ? (
                            <p className="truncate" title={ffmpegStatus.version}>
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
                            className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium active:scale-[0.97] disabled:opacity-45 dark:bg-white/[0.08]"
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
                                className="h-9 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground hover:bg-black/[0.04] disabled:opacity-45 dark:hover:bg-white/[0.06]"
                            >
                                清除
                            </button>
                        ) : null}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        FFmpeg 输出 32-bit 浮点 PCM，并保留源采样率；共享模式下系统仍可能按设备混音格式重采样。
                    </p>
                </div>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">输出设备</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {nativeBackendLabel} 接通后可切换设备
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {devices.map((device) => (
                            <ChoiceChip
                                key={device.id}
                                label={device.name}
                                active={(audioMode?.deviceId ?? "default") === device.id}
                                onClick={() => {
                                    void setAudioDevice(device.id).then(() =>
                                        getAudioOutputMode().then(setAudioMode),
                                    )
                                }}
                            />
                        ))}
                    </div>
                </div>

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
                            label={audioMode.exclusive ? "独占开" : "独占关"}
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

function AccountTab({ onLogin }: { onLogin: () => void }) {
    const {
        ready,
        loggedIn,
        profile,
        accounts,
        activeUserId,
        logout,
        switchAccount,
        removeAccount,
    } = useNeteaseSession()
    const [busyId, setBusyId] = useState<number | null>(null)

    async function handleSwitch(userId: number) {
        if (userId === activeUserId && loggedIn) {
            const name =
                accounts.find((item) => item.userId === userId)?.nickname?.trim() ||
                profile?.nickname ||
                `uid ${userId}`
            notifyInfo("已是当前账号", {
                id: "netease-switch-account",
                description: name,
            })
            return
        }
        setBusyId(userId)
        try {
            await switchAccount(userId)
        } finally {
            setBusyId(null)
        }
    }

    async function handleRemove(userId: number) {
        setBusyId(userId)
        try {
            await removeAccount(userId)
        } finally {
            setBusyId(null)
        }
    }

    return (
        <Section title="账号" description="多账号登录，设置内手动切换">
            <div className="space-y-3">
                <div className="material-panel space-y-4 rounded-[20px] px-4 py-4">
                    {!ready ? (
                        <div className="h-12 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.06]" />
                    ) : loggedIn && profile ? (
                        <div className="flex flex-wrap items-center gap-3">
                            {profile.avatarUrl ? (
                                <img
                                    src={profile.avatarUrl}
                                    alt=""
                                    className="size-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex size-12 items-center justify-center rounded-full bg-black/[0.06] text-[14px] font-medium dark:bg-white/[0.1]">
                                    {profile.nickname.slice(0, 1)}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
                                    {profile.nickname}
                                </p>
                                <p className="text-[12px] text-muted-foreground">
                                    当前使用 · uid {profile.userId}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={logout}
                                className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium active:scale-[0.97] dark:bg-white/[0.08]"
                            >
                                退出当前
                            </button>
                        </div>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">
                            当前未登录。可登录新账号，或从下方已保存列表切换。
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onLogin}
                            className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background active:scale-[0.97]"
                        >
                            {loggedIn ? "添加账号" : "登录"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void openNeteaseRegister()}
                            className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium active:scale-[0.97] dark:bg-white/[0.08]"
                        >
                            注册（官网）
                        </button>
                    </div>
                </div>

                {accounts.length > 0 ? (
                    <div className="material-panel space-y-2 rounded-[20px] px-4 py-3.5">
                        <div>
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                已保存账号
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                点击切换；移除只删本地凭证
                            </p>
                        </div>
                        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                            {accounts.map((account) => {
                                const isActive =
                                    loggedIn && activeUserId === account.userId
                                const busy = busyId === account.userId
                                return (
                                    <li
                                        key={account.userId}
                                        className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1"
                                    >
                                        {account.avatarUrl ? (
                                            <img
                                                src={account.avatarUrl}
                                                alt=""
                                                className="size-9 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex size-9 items-center justify-center rounded-full bg-black/[0.06] text-[12px] font-medium dark:bg-white/[0.1]">
                                                {account.nickname.slice(0, 1)}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium">
                                                {account.nickname}
                                                {isActive ? (
                                                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                                        使用中
                                                    </span>
                                                ) : null}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                uid {account.userId}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                disabled={busy || isActive}
                                                onClick={() =>
                                                    void handleSwitch(account.userId)
                                                }
                                                className="h-8 cursor-pointer rounded-full bg-black/[0.05] px-3 text-[11px] font-medium disabled:cursor-default disabled:opacity-40 active:scale-[0.97] dark:bg-white/[0.08]"
                                            >
                                                {busy && !isActive
                                                    ? "切换中"
                                                    : isActive
                                                      ? "当前"
                                                      : "切换"}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void handleRemove(account.userId)
                                                }
                                                className="h-8 cursor-pointer rounded-full px-3 text-[11px] font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-300"
                                            >
                                                移除
                                            </button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ) : null}
            </div>
        </Section>
    )
}

function AppearanceTab({
    titleBarStyle,
    onTitleBarStyleChange,
}: {
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
}) {
    const {
        theme,
        setTheme,
        appearance,
        setAccent,
        setTintScope,
        setCustomHue,
        setGlassOpacity,
        setGlassBlur,
        setMaterialGlass,
    } = useTheme()
    const [layout, setLayout] = useState<FullPlayerLayout>(() => getFullPlayerLayout())
    const [chrome, setChrome] = useState<FullPlayerChrome>(() => getFullPlayerChrome())
    const [performanceMode, setPerformanceModeState] = useState(() =>
        getPerformanceMode(),
    )
    const activeHue = resolveAccentHue(appearance)
    const customActive = appearance.accent === "custom"
    const nativeMacOS = isNativeMacOS()
    const { playlistView, playlistTracksView } = useLibraryLayout()

    // 毛玻璃由性能模式联动控制：开启时强制关闭、关闭时恢复记忆状态
    useEffect(() => {
        function onPerformance() {
            setPerformanceModeState(getPerformanceMode())
        }
        window.addEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
        return () =>
            window.removeEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
    }, [])

    useEffect(() => {
        function onLayout() {
            setLayout(getFullPlayerLayout())
        }
        function onChrome() {
            setChrome(getFullPlayerChrome())
        }
        window.addEventListener(LAYOUT_EVENT, onLayout)
        window.addEventListener(CHROME_EVENT, onChrome)
        return () => {
            window.removeEventListener(LAYOUT_EVENT, onLayout)
            window.removeEventListener(CHROME_EVENT, onChrome)
        }
    }, [])

    function handleLayoutPick(next: FullPlayerLayout) {
        setFullPlayerLayout(next)
        setLayout(next)
    }

    function handleLyricsAlign(next: LyricsAlign) {
        setFullPlayerChrome({ lyricsAlign: next })
        setChrome(getFullPlayerChrome())
    }

    function pickView(
        current: ViewMode,
        next: ViewMode,
        apply: (mode: ViewMode) => void,
    ) {
        if (current !== next) {
            apply(next)
        }
    }

    return (
        <Section title="外观" description="主题、色调、材质与全屏模板">
            <div className="space-y-3">
                <SettingsCard title="外观" description="跟随系统或固定明暗">
                    <div className="flex flex-wrap gap-2">
                        <ChoiceChip
                            active={theme === "system"}
                            onClick={() => setTheme("system")}
                            label="系统"
                        />
                        <ChoiceChip
                            active={theme === "light"}
                            onClick={() => setTheme("light")}
                            label="浅色"
                        />
                        <ChoiceChip
                            active={theme === "dark"}
                            onClick={() => setTheme("dark")}
                            label="深色"
                        />
                    </div>
                </SettingsCard>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">色调</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            预设色点，或拖动自定义色相
                        </p>
                    </div>
                    <div className="apple-segmented flex w-full" role="group" aria-label="调色范围">
                        <button
                            type="button"
                            aria-pressed={appearance.tintScope === "accent"}
                            onClick={() => setTintScope("accent")}
                            className="apple-segmented-item min-w-0 flex-1 cursor-pointer whitespace-nowrap px-3 text-[12px] font-medium text-muted-foreground aria-pressed:text-foreground"
                        >
                            强调色
                        </button>
                        <button
                            type="button"
                            aria-pressed={appearance.tintScope === "global"}
                            onClick={() => setTintScope("global")}
                            className="apple-segmented-item min-w-0 flex-1 cursor-pointer whitespace-nowrap px-3 text-[12px] font-medium text-muted-foreground aria-pressed:text-foreground"
                        >
                            全局色调
                        </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {appearance.tintScope === "global"
                            ? "背景、卡片、侧栏与玻璃材质使用低彩度染色"
                            : "仅影响按钮、选中态、焦点与图表等强调元素"}
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                        {ACCENT_OPTIONS.map((option) => {
                            const active = appearance.accent === option.id
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    title={option.label}
                                    onClick={() => setAccent(option.id)}
                                    className={cn(
                                        "size-8 cursor-pointer rounded-full transition-transform duration-150",
                                        "ring-offset-2 ring-offset-background active:scale-95",
                                        active
                                            ? "ring-2 ring-foreground/80"
                                            : "ring-1 ring-black/10 dark:ring-white/15",
                                    )}
                                    style={{
                                        background: accentSwatch(
                                            option.hue,
                                            option.id === "neutral",
                                        ),
                                    }}
                                />
                            )
                        })}
                        <button
                            type="button"
                            title="自定义"
                            onClick={() => setCustomHue(appearance.customHue)}
                            className={cn(
                                "relative size-8 cursor-pointer overflow-hidden rounded-full transition-transform duration-150",
                                "ring-offset-2 ring-offset-background active:scale-95",
                                customActive
                                    ? "ring-2 ring-foreground/80"
                                    : "ring-1 ring-black/10 dark:ring-white/15",
                            )}
                            style={{
                                background: `conic-gradient(
                                    oklch(0.7 0.16 0),
                                    oklch(0.7 0.16 60),
                                    oklch(0.7 0.16 120),
                                    oklch(0.7 0.16 180),
                                    oklch(0.7 0.16 240),
                                    oklch(0.7 0.16 300),
                                    oklch(0.7 0.16 360)
                                )`,
                            }}
                        />
                    </div>
                    <label className="block space-y-2">
                        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                            <span>自定义色相</span>
                            <span className="tabular-nums flex items-center gap-2">
                                <span
                                    className="inline-block size-3 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                                    style={{ background: accentSwatch(activeHue) }}
                                />
                                {activeHue}°
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={359}
                            step={1}
                            value={activeHue}
                            onChange={(event) =>
                                setCustomHue(Number(event.currentTarget.value))
                            }
                            className="progress-range w-full"
                            aria-label="自定义色相"
                        />
                        <div
                            className="h-2 w-full rounded-full"
                            style={{
                                background: `linear-gradient(
                                    to right,
                                    oklch(0.7 0.16 0),
                                    oklch(0.7 0.16 60),
                                    oklch(0.7 0.16 120),
                                    oklch(0.7 0.16 180),
                                    oklch(0.7 0.16 240),
                                    oklch(0.7 0.16 300),
                                    oklch(0.7 0.16 360)
                                )`,
                            }}
                        />
                    </label>
                </div>

                <div className="material-panel space-y-4 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">材质</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            玻璃透明度与模糊强度
                        </p>
                    </div>
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                        <span className="min-w-0">
                            <span className="block text-[13px] font-medium">
                                常驻毛玻璃
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                侧栏、底栏与面板的毛玻璃质感，开启可能有额外性能开销
                            </span>
                        </span>
                        <Switch
                            checked={appearance.materialGlass}
                            disabled={performanceMode}
                            onCheckedChange={setMaterialGlass}
                            aria-label="常驻毛玻璃"
                        />
                    </label>
                    <label className="block space-y-2">
                        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                            <span>透明度</span>
                            <span>{Math.round(appearance.glassOpacity * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min={0.35}
                            max={0.9}
                            step={0.01}
                            value={appearance.glassOpacity}
                            onChange={(event) =>
                                setGlassOpacity(Number(event.currentTarget.value))
                            }
                            className="progress-range w-full"
                        />
                    </label>
                    <label className="block space-y-2">
                        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                            <span>模糊</span>
                            <span>{Math.round(appearance.glassBlur)}px</span>
                        </div>
                        <input
                            type="range"
                            min={8}
                            max={48}
                            step={1}
                            value={appearance.glassBlur}
                            onChange={(event) =>
                                setGlassBlur(Number(event.currentTarget.value))
                            }
                            className="progress-range w-full"
                        />
                    </label>
                </div>

                {!nativeMacOS ? (
                    <SettingsCard title="标题栏样式" description="无边框窗口控件布局">
                        <div className="flex flex-wrap gap-2">
                            <ChoiceChip
                                active={titleBarStyle === "mac"}
                                onClick={() => onTitleBarStyleChange("mac")}
                                label="MAC"
                            />
                            <ChoiceChip
                                active={titleBarStyle === "windows"}
                                onClick={() => onTitleBarStyleChange("windows")}
                                label="Windows"
                            />
                        </div>
                    </SettingsCard>
                ) : null}

                <SettingsCard title="歌单展示" description="资料库里歌单用卡片或列表">
                    <div className="flex flex-wrap gap-2">
                        <ChoiceChip
                            active={playlistView === "card"}
                            onClick={() =>
                                pickView(playlistView, "card", setPlaylistView)
                            }
                            label="卡片"
                        />
                        <ChoiceChip
                            active={playlistView === "list"}
                            onClick={() =>
                                pickView(playlistView, "list", setPlaylistView)
                            }
                            label="列表"
                        />
                    </div>
                </SettingsCard>

                <SettingsCard
                    title="歌单歌曲"
                    description="打开歌单后歌曲用卡片或列表"
                >
                    <div className="flex flex-wrap gap-2">
                        <ChoiceChip
                            active={playlistTracksView === "card"}
                            onClick={() =>
                                pickView(
                                    playlistTracksView,
                                    "card",
                                    setPlaylistTracksView,
                                )
                            }
                            label="卡片"
                        />
                        <ChoiceChip
                            active={playlistTracksView === "list"}
                            onClick={() =>
                                pickView(
                                    playlistTracksView,
                                    "list",
                                    setPlaylistTracksView,
                                )
                            }
                            label="列表"
                        />
                    </div>
                </SettingsCard>

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">
                            全屏播放模板
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {FULL_PLAYER_LAYOUTS.find((item) => item.id === layout)
                                ?.description ?? "播放样式"}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {FULL_PLAYER_LAYOUTS.map((item) => (
                            <ChoiceChip
                                key={item.id}
                                active={layout === item.id}
                                onClick={() => handleLayoutPick(item.id)}
                                label={item.label}
                            />
                        ))}
                    </div>
                    {layout === "lyrics" ? (
                        <div className="space-y-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
                            <p className="text-[12px] text-muted-foreground">歌词对齐</p>
                            <div className="flex flex-wrap gap-2">
                                {LYRICS_ALIGNS.map((item) => (
                                    <ChoiceChip
                                        key={item.id}
                                        active={chrome.lyricsAlign === item.id}
                                        onClick={() => handleLyricsAlign(item.id)}
                                        label={item.label}
                                    />
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                仅「歌词」模板：纯歌词，无封面
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>
        </Section>
    )
}

function formatCheckedAt(ts: number): string {
    try {
        return new Date(ts).toLocaleString("zh-CN", {
            hour12: false,
        })
    } catch {
        return "—"
    }
}

function formatCacheTtlLabel(): string {
    const hours = CACHE_TTL_MS / (60 * 60 * 1000)
    return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
}

function UpdateTab() {
    const { status, checking, refresh } = useAppUpdate()

    async function handleRefresh() {
        try {
            const result = await refresh(true)
            if (result.error && !result.latestVersion) {
                notifyError("检查更新失败", { description: result.error })
                return
            }
            if (result.hasUpdate) {
                notifySuccess("发现新版本", {
                    description: `${result.currentVersion} → ${result.latestVersion}`,
                })
                return
            }
            notifyInfo("已是最新版本", {
                description: result.currentVersion
                    ? `当前 ${result.currentVersion}`
                    : undefined,
            })
        } catch (error) {
            notifyError("检查更新失败", {
                description:
                    error instanceof Error ? error.message : "未知错误",
            })
        }
    }

    async function handleOpenRelease() {
        const url =
            status?.htmlUrl?.trim() ||
            "https://github.com/YuiNijika/MusicStorm/releases/latest"
        await openExternalUrl(url)
    }

    const current = status?.currentVersion || "—"
    const latest = status?.latestVersion || "—"
    const releaseTitle = status?.releaseName || status?.latestTag || "暂无 Release 信息"
    const body = status?.releaseBody?.trim() || ""

    return (
        <div className="space-y-7">
            <Section
                title="版本更新"
                description="通过 GitHub Releases 检测，不自动安装"
            >
                <div className="space-y-3">
                    <div className="material-panel space-y-4 rounded-[20px] px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-black/[0.03] px-3.5 py-3 dark:bg-white/[0.04]">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                当前版本
                            </p>
                            <p className="mt-1 font-mono text-[18px] font-semibold tracking-[-0.02em]">
                                {current}
                            </p>
                        </div>
                        <div className="rounded-2xl bg-black/[0.03] px-3.5 py-3 dark:bg-white/[0.04]">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                最新版本
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="font-mono text-[18px] font-semibold tracking-[-0.02em]">
                                    {latest}
                                </p>
                                {status?.hasUpdate ? (
                                    <span className="rounded-full bg-rose-500/90 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-white">
                                        new
                                    </span>
                                ) : status?.latestVersion ? (
                                    <span className="rounded-full bg-black/[0.06] px-1.5 py-px text-[10px] font-medium text-muted-foreground dark:bg-white/[0.08]">
                                        最新
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                        {status?.checkedAt ? (
                            <span>
                                上次检测 {formatCheckedAt(status.checkedAt)}
                                {status.fromCache ? " · 缓存" : " · 实时"}
                            </span>
                        ) : (
                            <span>尚未检测</span>
                        )}
                        <span className="text-muted-foreground/50">·</span>
                        <span>缓存 {formatCacheTtlLabel()}</span>
                        {status?.publishedAt ? (
                            <>
                                <span className="text-muted-foreground/50">·</span>
                                <span>
                                    发布{" "}
                                    {formatCheckedAt(
                                        Date.parse(status.publishedAt) || 0,
                                    )}
                                </span>
                            </>
                        ) : null}
                    </div>

                    {status?.error ? (
                        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
                            {status.error}
                            {status.latestVersion
                                ? "（已展示缓存结果）"
                                : ""}
                        </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void handleRefresh()}
                            disabled={checking}
                            className={cn(
                                "h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium",
                                "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45",
                                "dark:bg-white/[0.08]",
                            )}
                        >
                            {checking ? "检测中…" : "刷新检测"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleOpenRelease()}
                            className={cn(
                                "h-9 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background",
                                "active:scale-[0.97]",
                            )}
                        >
                            前往更新
                        </button>
                    </div>
                </div>

                <div className="material-panel space-y-2.5 rounded-[20px] px-4 py-4">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">
                            {releaseTitle}
                        </p>
                        {status?.latestTag ? (
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                tag {status.latestTag}
                            </p>
                        ) : null}
                    </div>
                    {body ? (
                        <pre className="max-h-[min(420px,50vh)] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-black/[0.03] px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground/90 dark:bg-white/[0.04]">
                            {body}
                        </pre>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">
                            暂无 Release 说明。可点「刷新检测」从 GitHub
                            拉取最新信息。
                        </p>
                    )}
                </div>
            </div>
        </Section>
        </div>
    )
}

function OtherTab() {
    const { appearance, setMaterialGlass } = useTheme()
    const nativeMacOS = isNativeMacOS()
    const [devtoolsEnabled, setDevtoolsEnabledState] = useState(() =>
        getDevToolsEnabled(),
    )
    const [performanceMode, setPerformanceModeState] = useState(() =>
        getPerformanceMode(),
    )
    const [cacheTtl, setCacheTtl] = useState(() => getApiCacheTtlMs())
    const [autoPurge, setAutoPurge] = useState(() => getApiCacheAutoPurge())
    const [cacheHint, setCacheHint] = useState<string | null>(null)
    const [storagePaths, setStoragePaths] = useState<Awaited<
        ReturnType<typeof getStoragePaths>
    > | null>(null)

    useEffect(() => {
        function onDevtools() {
            setDevtoolsEnabledState(getDevToolsEnabled())
        }
        function onTtl() {
            setCacheTtl(getApiCacheTtlMs())
        }
        function onAutoPurge() {
            setAutoPurge(getApiCacheAutoPurge())
        }
        function onPerformance() {
            setPerformanceModeState(getPerformanceMode())
        }
        window.addEventListener(DEVTOOLS_EVENT, onDevtools)
        window.addEventListener(TTL_EVENT, onTtl)
        window.addEventListener(AUTO_PURGE_EVENT, onAutoPurge)
        window.addEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
        return () => {
            window.removeEventListener(DEVTOOLS_EVENT, onDevtools)
            window.removeEventListener(TTL_EVENT, onTtl)
            window.removeEventListener(AUTO_PURGE_EVENT, onAutoPurge)
            window.removeEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        void getStoragePaths().then((paths) => {
            if (!cancelled) {
                setStoragePaths(paths)
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function handleClearApiCache() {
        try {
            await apiCacheClear()
            setCacheHint("已清空")
            window.setTimeout(() => setCacheHint(null), 1600)
            notifySuccess("已清空 API 缓存")
        } catch (error) {
            notifyError("清空缓存失败", {
                description:
                    error instanceof Error ? error.message : "请重试",
            })
        }
    }

    async function handleClearCoverCache() {
        try {
            // 保留仍在引用的封面：本地库专辑/艺人封面 + 歌曲封面覆盖
            const keep = collectCoverKeepHashes()
            await invoke("clear_cover_cache", { keepHashes: keep })
            notifySuccess("已清空封面缓存", {
                description: "未被引用的封面已清理，引用中的封面保留",
            })
        } catch (error) {
            notifyError("清空封面缓存失败", {
                description:
                    error instanceof Error ? error.message : "请重试",
            })
        }
    }

    async function handleTogglePerformance(enabled: boolean) {
        setPerformanceModeState(enabled)
        if (enabled) {
            // 先记住当前毛玻璃状态，关闭性能模式时恢复原样
            try {
                window.localStorage.setItem(
                    MATERIAL_GLASS_MEMO_KEY,
                    appearance.materialGlass ? "1" : "0",
                )
            } catch {
                // 记忆失败也不阻塞切换
            }
            // 性能模式强制关闭毛玻璃，外观设置开关同步
            setMaterialGlass(false)
        } else {
            // 恢复记忆的毛玻璃状态：之前开着就重新打开
            let memo = "0"
            try {
                memo = window.localStorage.getItem(MATERIAL_GLASS_MEMO_KEY) ?? "0"
            } catch {
                // 读不到记忆时保持现状
            }
            if (memo === "1") {
                setMaterialGlass(true)
            }
        }
        await setPerformanceMode(enabled)
    }

    const perfItems = [
        { label: "关闭常驻毛玻璃", note: "立即生效，与外观设置联动" },
        { label: "关闭界面动画与过渡", note: "立即生效" },
        { label: "禁用 GPU 进程与硬件合成", note: "重启应用后生效" },
    ]

    return (
        <div className="space-y-7">
            <Section
                title="性能模式"
                description="牺牲视觉效果换更低的内存与 GPU 占用"
            >
                <div className="space-y-3">
                    <div className="material-panel flex items-center justify-between gap-4 rounded-[20px] px-4 py-4">
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                性能模式
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                一键关闭毛玻璃与动画，禁用 GPU 相关进程
                            </p>
                        </div>
                        <Switch
                            checked={performanceMode}
                            onCheckedChange={(checked) =>
                                void handleTogglePerformance(checked)
                            }
                            aria-label="性能模式"
                        />
                    </div>
                    <div className="material-panel space-y-2 rounded-[20px] px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                            <Gauge className="size-4 text-muted-foreground" />
                            <p className="text-[12px] font-medium text-muted-foreground">
                                开启后将应用
                            </p>
                        </div>
                        {perfItems.map((item) => (
                            <div
                                key={item.label}
                                className="flex items-start gap-2"
                            >
                                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium">
                                        {item.label}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {item.note}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="material-panel flex items-center justify-between gap-4 rounded-[20px] px-4 py-3.5">
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium">常驻毛玻璃</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                与外观设置联动；性能模式下强制关闭
                            </p>
                        </div>
                        <Switch
                            checked={appearance.materialGlass}
                            disabled={performanceMode}
                            onCheckedChange={setMaterialGlass}
                            aria-label="常驻毛玻璃"
                        />
                    </div>
                </div>
            </Section>

            <Section
                title="开发者工具"
                description="调试界面布局与网络请求"
            >
                <div className="material-panel flex items-center justify-between gap-4 rounded-[20px] px-4 py-4">
                    <div className="min-w-0">
                        <p className="text-[14px] font-medium tracking-[-0.01em]">
                            启用 DevTools
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            启用后按 F12 打开开发者工具（仅开发构建生效）
                        </p>
                    </div>
                    <Switch
                        checked={devtoolsEnabled}
                        onCheckedChange={(checked) => {
                            setDevToolsEnabled(checked)
                            setDevtoolsEnabledState(checked)
                            if (checked && import.meta.env.DEV) {
                                void invoke("open_devtools")
                            }
                        }}
                        aria-label="启用 DevTools"
                    />
                </div>
            </Section>

            <Section
                title="缓存"
                description="API 响应与本地封面缓存"
            >
                <div className="space-y-3">
                    <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[14px] font-medium tracking-[-0.01em]">
                                    API 响应缓存
                                </p>
                                <p className="mt-0.5 text-[12px] text-muted-foreground">
                                    {nativeMacOS
                                        ? "列表类接口写入用户数据库与系统缓存目录，默认 "
                                        : "列表类接口写入 exe 旁数据库与 cache 目录，默认 "}
                                    {Math.round(DEFAULT_TTL_MS / 60_000)} 分钟
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleClearApiCache()}
                                className="h-8 shrink-0 cursor-pointer rounded-full bg-black/[0.05] px-3 text-[12px] font-medium active:scale-[0.97] dark:bg-white/[0.08]"
                            >
                                清空缓存
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {TTL_PRESETS.map((preset) => (
                                <ChoiceChip
                                    key={preset.id}
                                    label={preset.label}
                                    active={cacheTtl === preset.ms}
                                    onClick={() => {
                                        setApiCacheTtlMs(preset.ms)
                                        setCacheTtl(preset.ms)
                                    }}
                                />
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.05]">
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium">
                                    自动清理过期缓存
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    超过上方时长后删除数据库与 cache 目录中的过期项
                                </p>
                            </div>
                            <Switch
                                checked={autoPurge}
                                disabled={cacheTtl <= 0}
                                onCheckedChange={(checked) => {
                                    setApiCacheAutoPurge(checked)
                                    setAutoPurge(checked)
                                }}
                            />
                        </div>
                        {cacheHint ? (
                            <p className="text-[12px] text-muted-foreground">
                                {cacheHint}
                            </p>
                        ) : null}
                        {storagePaths ? (
                            <div className="space-y-1 rounded-xl bg-black/[0.03] px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground dark:bg-white/[0.05]">
                                <p className="truncate" title={storagePaths.appDir}>
                                    {nativeMacOS ? "应用数据" : "运行目录"} ·{" "}
                                    {storagePaths.appDir}
                                </p>
                                <p className="truncate" title={storagePaths.databasePath}>
                                    数据库 · {storagePaths.databasePath}
                                </p>
                                <p className="truncate" title={storagePaths.cacheDir}>
                                    缓存 · {storagePaths.cacheDir}
                                </p>
                            </div>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">
                                浏览器预览无本地路径；桌面端由 Tauri 解析 exe 目录
                            </p>
                        )}
                    </div>

                    <div className="material-panel flex items-center justify-between gap-4 rounded-[20px] px-4 py-4">
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                封面缓存
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                原图与缩略图缓存，超出上限自动清理最旧文件
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleClearCoverCache()}
                            className="h-8 shrink-0 cursor-pointer rounded-full bg-black/[0.05] px-3 text-[12px] font-medium active:scale-[0.97] dark:bg-white/[0.08]"
                        >
                            清空封面缓存
                        </button>
                    </div>
                </div>
            </Section>
        </div>
    )
}

function HotkeysTab() {
    const [globalShortcuts, setGlobalShortcuts] = useState<
        Record<ShortcutAction, string>
    >(() => ({ ...DEFAULT_SHORTCUTS }))
    const [inAppShortcuts, setInAppShortcuts] = useState<InAppShortcutMap>(
        () => getInAppShortcuts(),
    )
    const [recording, setRecording] = useState<{
        kind: "global" | "in-app"
        id: string
    } | null>(null)

    useEffect(() => {
        let cancelled = false
        void loadGlobalShortcuts().then((loaded) => {
            if (!cancelled) {
                setGlobalShortcuts(loaded)
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function saveGlobalShortcut(action: ShortcutAction, combo: string) {
        setRecording(null)
        try {
            await updateGlobalShortcut(action, combo)
            setGlobalShortcuts((prev) => ({ ...prev, [action]: combo }))
            notifySuccess(
                combo ? "全局快捷键已更新" : "已关闭该快捷键",
                { description: combo || "该动作不再响应全局按键" },
            )
        } catch (error) {
            notifyError("设置失败", {
                description:
                    error instanceof Error
                        ? error.message
                        : "组合键可能已被占用",
            })
        }
    }

    function saveInAppShortcut(action: InAppShortcutAction, combo: string) {
        setRecording(null)
        setInAppShortcuts((prev) => ({ ...prev, [action]: combo }))
        setInAppShortcut(action, combo)
        notifySuccess(
            combo ? "应用内快捷键已更新" : "已关闭该快捷键",
            { description: combo || "该动作不再响应按键" },
        )
    }

    useEffect(() => {
        if (!recording) {
            return
        }
        const target = recording
        function onKeyDown(event: KeyboardEvent) {
            event.preventDefault()
            event.stopPropagation()
            if (event.key === "Escape") {
                setRecording(null)
                return
            }
            if (event.key === "Backspace" || event.key === "Delete") {
                if (target.kind === "global") {
                    void saveGlobalShortcut(
                        target.id as ShortcutAction,
                        "",
                    )
                } else {
                    saveInAppShortcut(
                        target.id as InAppShortcutAction,
                        "",
                    )
                }
                return
            }
            const combo =
                target.kind === "global"
                    ? keydownToShortcut(event)
                    : keydownToInAppShortcut(event)
            if (!combo) {
                return
            }
            if (target.kind === "global") {
                // 冲突检测：同一组合不能绑到两个全局动作
                const conflict = SHORTCUT_ACTIONS.find(
                    (item) =>
                        item.id !== target.id &&
                        globalShortcuts[item.id] === combo,
                )
                if (conflict) {
                    notifyWarning("组合键冲突", {
                        description: `「${conflict.label}」已使用 ${combo}`,
                    })
                    setRecording(null)
                    return
                }
                void saveGlobalShortcut(target.id as ShortcutAction, combo)
            } else {
                const conflict = IN_APP_ACTIONS.find(
                    (item) =>
                        item.id !== target.id &&
                        inAppShortcuts[item.id] === combo,
                )
                if (conflict) {
                    notifyWarning("组合键冲突", {
                        description: `「${conflict.label}」已使用 ${combo}`,
                    })
                    setRecording(null)
                    return
                }
                saveInAppShortcut(target.id as InAppShortcutAction, combo)
            }
        }
        window.addEventListener("keydown", onKeyDown, true)
        return () => window.removeEventListener("keydown", onKeyDown, true)
    }, [recording, globalShortcuts, inAppShortcuts])

    return (
        <Section title="快捷键" description="全局与应用内快捷键均支持自定义">
            <div className="space-y-4">
                <div>
                    <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">
                        {isMacOS()
                            ? "全局快捷键（默认关闭，避免抢占系统按键；自定义时需含 ⌘/⌥/⌃）"
                            : "全局快捷键（任何应用下生效，需含 Ctrl/Alt/Super 修饰或 F 键）"}
                    </p>
                    <div className="material-panel divide-y divide-black/[0.05] rounded-[20px] dark:divide-white/[0.06]">
                        {SHORTCUT_ACTIONS.map((item) => (
                            <ShortcutRow
                                key={`global-${item.id}`}
                                label={item.label}
                                value={globalShortcuts[item.id]}
                                active={
                                    recording?.kind === "global" &&
                                    recording.id === item.id
                                }
                                onStart={() =>
                                    setRecording({
                                        kind: "global",
                                        id: item.id,
                                    })
                                }
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">
                        应用内快捷键（窗口聚焦时生效）
                    </p>
                    <div className="material-panel divide-y divide-black/[0.05] rounded-[20px] dark:divide-white/[0.06]">
                        {IN_APP_ACTIONS.map((item) => (
                            <ShortcutRow
                                key={`in-app-${item.id}`}
                                label={item.label}
                                value={inAppShortcuts[item.id]}
                                active={
                                    recording?.kind === "in-app" &&
                                    recording.id === item.id
                                }
                                onStart={() =>
                                    setRecording({
                                        kind: "in-app",
                                        id: item.id,
                                    })
                                }
                            />
                        ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                        提示：录制时按 Esc 取消、按退格清除；输入框聚焦时应用内快捷键不生效
                    </p>
                </div>
            </div>
        </Section>
    )
}

function ShortcutRow({
    label,
    value,
    active,
    onStart,
}: {
    label: string
    value: string
    active: boolean
    onStart: () => void
}) {
    return (
        <div
            className={cn(
                "flex items-center justify-between gap-3 px-4 py-2.5",
                active && "bg-black/[0.03] dark:bg-white/[0.05]",
            )}
        >
            <span className="text-[13px] text-foreground/90">{label}</span>
            {active ? (
                <span className="text-[12px] font-medium text-primary">
                    按下组合键…（Esc 取消，退格清除）
                </span>
            ) : (
                <button
                    type="button"
                    onClick={onStart}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                    title="点击修改"
                >
                    {value ? (
                        <kbd className="glass-chip rounded-lg px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                            {formatShortcut(value)}
                        </kbd>
                    ) : (
                        <span className="text-[12px] text-muted-foreground">
                            未设置
                        </span>
                    )}
                    <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
            )}
        </div>
    )
}

function SettingsCard({
    title,
    description,
    children,
}: {
    title: string
    description: string
    children: ReactNode
}) {
    return (
        <div className="material-panel flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-[14px] font-medium tracking-[-0.01em]">{title}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}

function ChoiceChip({
    label,
    active,
    onClick,
}: {
    label: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-100",
                "active:scale-[0.97]",
                active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
            )}
        >
            {label}
        </button>
    )
}

export { SettingsPage, readTitleBarStyle, TITLE_BAR_STORAGE_KEY }
export type { SettingsPageProps, SettingsTab }
