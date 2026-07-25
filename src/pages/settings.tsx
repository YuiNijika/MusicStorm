import { useEffect, useState, type ReactNode } from "react"

import { useTheme } from "@/components/app/theme-provider"
import type { TitleBarStyle } from "@/components/app/title-bar"
import { NeteaseAuthDialog } from "@/components/auth/netease-auth-dialog"
import { Section } from "@/components/music/section"
import { Switch } from "@/components/ui/switch"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlayer } from "@/hooks/use-player"
import { ACCENT_OPTIONS, accentSwatch, resolveAccentHue } from "@/lib/appearance/appearance-prefs"
import {
    setPlaylistTracksView,
    setPlaylistView,
    type ViewMode,
} from "@/lib/library/layout-prefs"
import { useLibraryLayout } from "@/hooks/use-library-layout"
import {
    applyApiPreset,
    getApiPresetId,
    NETEASE_API_PRESETS,
    speedTestApi,
    type ApiPresetId,
} from "@/lib/netease/api-presets"
import { apiCacheClear } from "@/lib/netease/api-cache"
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
import { DEFAULT_BASE_URL, getNeteaseBaseUrl } from "@/lib/netease/client"
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
    FULL_PLAYER_LAYOUTS,
    LAYOUT_EVENT,
    getFullPlayerLayout,
    setFullPlayerLayout,
    type FullPlayerLayout,
} from "@/lib/player/full-player-prefs"
import {
    getAudioOutputMode,
    listAudioDevices,
    setAudioDevice,
    setAudioExclusive,
    type AudioDeviceInfo,
    type AudioOutputMode,
} from "@/lib/player/native-bridge"
import { getStoragePaths } from "@/lib/storage/paths"
import { cn } from "@/lib/utils"

const TITLE_BAR_STORAGE_KEY = "musicstorm-titlebar-style"

type SettingsTab = "source" | "playback" | "account" | "appearance" | "hotkeys"

const TABS: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: "外观" },
    { id: "source", label: "音源" },
    { id: "playback", label: "播放" },
    { id: "account", label: "账号" },
    { id: "hotkeys", label: "快捷键" },
]

function readTitleBarStyle(): TitleBarStyle {
    if (typeof window === "undefined") {
        return "mac"
    }
    const stored = window.localStorage.getItem(TITLE_BAR_STORAGE_KEY)
    return stored === "windows" ? "windows" : "mac"
}

type SettingsPageProps = {
    titleBarStyle: TitleBarStyle
    onTitleBarStyleChange: (style: TitleBarStyle) => void
}

function SettingsPage({ titleBarStyle, onTitleBarStyleChange }: SettingsPageProps) {
    const [tab, setTab] = useState<SettingsTab>("appearance")
    const [authOpen, setAuthOpen] = useState(false)

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                {TABS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={cn(
                            "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                            "active:scale-[0.97]",
                            tab === item.id
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

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
            {tab === "hotkeys" ? <HotkeysTab /> : null}

            <NeteaseAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </div>
    )
}

function SourceTab() {
    const [presetId, setPresetId] = useState<ApiPresetId>(() => getApiPresetId())
    const [apiBase, setApiBase] = useState(() => getNeteaseBaseUrl())
    const [savedHint, setSavedHint] = useState<string | null>(null)
    const [speedHint, setSpeedHint] = useState<string | null>(null)
    const [speedLoading, setSpeedLoading] = useState(false)
    const [qualityBr, setQualityBr] = useState<QualityBr>(() => getNeteaseQualityBr())
    const [cacheTtl, setCacheTtl] = useState(() => getApiCacheTtlMs())
    const [autoPurge, setAutoPurge] = useState(() => getApiCacheAutoPurge())
    const [cacheHint, setCacheHint] = useState<string | null>(null)
    const [storagePaths, setStoragePaths] = useState<Awaited<
        ReturnType<typeof getStoragePaths>
    >>(null)

    useEffect(() => {
        function onTtl() {
            setCacheTtl(getApiCacheTtlMs())
        }
        function onAutoPurge() {
            setAutoPurge(getApiCacheAutoPurge())
        }
        window.addEventListener(TTL_EVENT, onTtl)
        window.addEventListener(AUTO_PURGE_EVENT, onAutoPurge)
        return () => {
            window.removeEventListener(TTL_EVENT, onTtl)
            window.removeEventListener(AUTO_PURGE_EVENT, onAutoPurge)
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

    function selectPreset(id: ApiPresetId) {
        const next = applyApiPreset(id, apiBase)
        setPresetId(id)
        setApiBase(next)
        setSavedHint(id === "custom" ? null : "已切换")
        window.setTimeout(() => setSavedHint(null), 1600)
    }

    function handleSaveCustom() {
        const next = applyApiPreset("custom", apiBase.trim() || DEFAULT_BASE_URL)
        setPresetId("custom")
        setApiBase(next)
        setSavedHint("已保存")
        window.setTimeout(() => setSavedHint(null), 1600)
    }

    async function handleSpeedTest() {
        setSpeedLoading(true)
        setSpeedHint(null)
        const result = await speedTestApi(apiBase.trim() || getNeteaseBaseUrl())
        setSpeedLoading(false)
        setSpeedHint(result.ok ? `${result.ms} ms` : result.message)
    }

    async function handleClearCache() {
        await apiCacheClear()
        setCacheHint("已清空")
        window.setTimeout(() => setCacheHint(null), 1600)
    }

    return (
        <Section title="音源" description="API 源、缓存与网易云音质">
            <div className="space-y-3">
                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">API 源</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            默认官方源，可切换公共服务或自定义
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {NETEASE_API_PRESETS.map((preset) => (
                            <ChoiceChip
                                key={preset.id}
                                label={preset.label}
                                active={presetId === preset.id}
                                onClick={() => selectPreset(preset.id)}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            value={apiBase}
                            disabled={presetId !== "custom"}
                            onChange={(event) => setApiBase(event.currentTarget.value)}
                            placeholder={DEFAULT_BASE_URL}
                            className={cn(
                                "material-field h-9 min-w-[240px] flex-1 rounded-xl px-3 text-[13px] outline-none",
                                presetId !== "custom" && "opacity-60",
                            )}
                        />
                        {presetId === "custom" ? (
                            <button
                                type="button"
                                onClick={handleSaveCustom}
                                className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background active:scale-[0.97]"
                            >
                                保存
                            </button>
                        ) : null}
                        <button
                            type="button"
                            disabled={speedLoading}
                            onClick={() => void handleSpeedTest()}
                            className="h-9 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[12px] font-medium active:scale-[0.97] disabled:opacity-50 dark:bg-white/[0.08]"
                        >
                            {speedLoading ? "测速中" : "测速"}
                        </button>
                        {speedHint ? (
                            <span className="text-[12px] text-muted-foreground">{speedHint}</span>
                        ) : null}
                        {savedHint ? (
                            <span className="text-[12px] text-muted-foreground">{savedHint}</span>
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

                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                API 响应缓存
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                列表类接口写入 exe 旁数据库与 cache 目录，默认{" "}
                                {Math.round(DEFAULT_TTL_MS / 60_000)} 分钟
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleClearCache()}
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
                            <p className="text-[13px] font-medium">自动清理过期缓存</p>
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
                        <p className="text-[12px] text-muted-foreground">{cacheHint}</p>
                    ) : null}
                    {storagePaths ? (
                        <div className="space-y-1 rounded-xl bg-black/[0.03] px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground dark:bg-white/[0.05]">
                            <p className="truncate" title={storagePaths.appDir}>
                                运行目录 · {storagePaths.appDir}
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

                <SettingsCard
                    title="本地模式"
                    description="桌面端可选文件夹导入音频，索引保存在本机"
                >
                    <span className="text-[12px] text-muted-foreground">已支持导入</span>
                </SettingsCard>
            </div>
        </Section>
    )
}

function PlaybackTab() {
    const { engineStatus } = usePlayer()
    const [enginePref, setEnginePrefState] = useState<EnginePref>(() => getEnginePref())
    const [fadeEnabled, setFadeEnabledState] = useState(() => getFadePrefs().enabled)
    const [fadeMs, setFadeMsState] = useState(() => getFadePrefs().durationMs)
    const [devices, setDevices] = useState<AudioDeviceInfo[]>([])
    const [audioMode, setAudioMode] = useState<AudioOutputMode | null>(null)

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

    return (
        <Section title="播放" description="引擎、淡入淡出与输出设备">
            <div className="space-y-3">
                <div className="material-panel space-y-3 rounded-[20px] px-4 py-3.5">
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">播放引擎</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            当前：{labelForEngineStatus(engineStatus)}
                            {audioMode?.note ? ` · ${audioMode.note}` : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            无损/高规格本地走 WASAPI，在线与普通 mp3 走 H5
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
                    <div>
                        <p className="text-[14px] font-medium tracking-[-0.01em]">输出设备</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            WASAPI 接通后可切换设备
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

                <SettingsCard
                    title="WASAPI 独占"
                    description={
                        audioMode?.exclusive
                            ? "已开启（设备支持时生效）"
                            : "共享模式（当前）"
                    }
                >
                    <ChoiceChip
                        label={audioMode?.exclusive ? "独占开" : "独占关"}
                        active={Boolean(audioMode?.exclusive)}
                        onClick={() => {
                            const next = !audioMode?.exclusive
                            void setAudioExclusive(next).then(() =>
                                getAudioOutputMode().then(setAudioMode),
                            )
                        }}
                    />
                </SettingsCard>
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
        setCustomHue,
        setGlassOpacity,
        setGlassBlur,
    } = useTheme()
    const [layout, setLayout] = useState<FullPlayerLayout>(() => getFullPlayerLayout())
    const activeHue = resolveAccentHue(appearance)
    const customActive = appearance.accent === "custom"
    const { playlistView, playlistTracksView } = useLibraryLayout()

    useEffect(() => {
        function onLayout() {
            setLayout(getFullPlayerLayout())
        }
        window.addEventListener(LAYOUT_EVENT, onLayout)
        return () => window.removeEventListener(LAYOUT_EVENT, onLayout)
    }, [])

    function handleLayoutPick(next: FullPlayerLayout) {
        setFullPlayerLayout(next)
        setLayout(next)
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
                            classic / cover / lyrics
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
                </div>
            </div>
        </Section>
    )
}

function HotkeysTab() {
    return (
        <Section title="快捷键" description="输入框聚焦时不响应">
            <div className="material-panel divide-y divide-black/[0.05] rounded-[20px] dark:divide-white/[0.06]">
                {[
                    ["空格", "播放 / 暂停"],
                    ["← / →", "快退 / 快进 5 秒"],
                    ["↑ / ↓", "音量增减"],
                    ["[ / ]", "上一首 / 下一首"],
                    ["Esc", "关闭全屏播放"],
                ].map(([key, desc]) => (
                    <div
                        key={key}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                        <span className="text-[13px] text-muted-foreground">{desc}</span>
                        <kbd className="glass-chip rounded-lg px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                            {key}
                        </kbd>
                    </div>
                ))}
            </div>
        </Section>
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
                    ? "bg-foreground text-background"
                    : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
            )}
        >
            {label}
        </button>
    )
}

export { SettingsPage, readTitleBarStyle, TITLE_BAR_STORAGE_KEY }
export type { SettingsPageProps }