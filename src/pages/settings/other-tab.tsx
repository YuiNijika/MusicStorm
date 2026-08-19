import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Check, Gauge } from "lucide-react"

import { Section } from "@/components/music/section"
import { Switch } from "@/components/ui/switch"
import { useTheme } from "@/components/app/theme-provider"
import {
    CLOSE_TO_TRAY_EVENT,
    getCloseToTray,
    setCloseToTray,
} from "@/lib/app/close-to-tray-prefs"
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
import { apiCacheClear } from "@/lib/netease/api-cache"
import {
    LIMIT_PRESETS,
    getCoverCacheLimitBytes,
    setCoverCacheLimitBytes,
} from "@/lib/music/cover-cache-prefs"
import { collectCoverRefHashes } from "@/lib/music/cover-overrides"
import { extractCoverHash } from "@/lib/local/cover"
import { loadLocalLibrary } from "@/lib/local/library-store"
import { getStoragePaths } from "@/lib/storage/paths"
import { notifyError, notifySuccess } from "@/lib/notify"
import { isMacOS, isNativeMacOS } from "@/lib/platform"
import {
    ChoiceChip,
    SettingsGroup,
    SwitchRow,
} from "@/pages/settings/settings-ui"
import { isWebMode } from "@/lib/web-mode"

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

function OtherTab() {
    const { appearance, setMaterialGlass } = useTheme()
    const nativeMacOS = isNativeMacOS()
    const [devtoolsEnabled, setDevtoolsEnabledState] = useState(() =>
        getDevToolsEnabled(),
    )
    const [performanceMode, setPerformanceModeState] = useState(() =>
        getPerformanceMode(),
    )
    const [closeToTray, setCloseToTrayState] = useState(() => getCloseToTray())
    const [cacheTtl, setCacheTtl] = useState(() => getApiCacheTtlMs())
    const [autoPurge, setAutoPurge] = useState(() => getApiCacheAutoPurge())
    const [coverCacheLimit, setCoverCacheLimit] = useState(() =>
        getCoverCacheLimitBytes(),
    )
    const [cacheHint, setCacheHint] = useState<string | null>(null)
    const [storagePaths, setStoragePaths] = useState<Awaited<
        ReturnType<typeof getStoragePaths>
    > | null>(null)

    useEffect(() => {
        function onDevtools() {
            setDevtoolsEnabledState(getDevToolsEnabled())
        }
        function onCloseToTray() {
            setCloseToTrayState(getCloseToTray())
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
        window.addEventListener(CLOSE_TO_TRAY_EVENT, onCloseToTray)
        window.addEventListener(TTL_EVENT, onTtl)
        window.addEventListener(AUTO_PURGE_EVENT, onAutoPurge)
        window.addEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
        return () => {
            window.removeEventListener(DEVTOOLS_EVENT, onDevtools)
            window.removeEventListener(CLOSE_TO_TRAY_EVENT, onCloseToTray)
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

    function handleCoverCacheLimit(bytes: number) {
        setCoverCacheLimitBytes(bytes)
        setCoverCacheLimit(bytes)
        // 立即按新阈值清理一次，超限的最旧文件即刻回收
        void invoke("purge_cover_cache_cmd", { maxBytes: bytes }).catch(
            () => {},
        )
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
                memo =
                    window.localStorage.getItem(MATERIAL_GLASS_MEMO_KEY) ??
                    "0"
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
            {!isWebMode() ? (
                <Section
                    title="窗口与托盘"
                    description="关闭窗口的行为与恢复方式"
                >
                    <SettingsGroup>
                        <SwitchRow
                            title={
                                isMacOS()
                                    ? "关闭窗口后保留在菜单栏"
                                    : "关闭窗口时最小化到托盘"
                            }
                            description={
                                isMacOS()
                                    ? "关闭后音乐继续播放；点击 Dock 或菜单栏图标恢复，⌘Q 退出"
                                    : "关闭后音乐继续播放，从系统托盘可恢复；退出请用托盘菜单"
                            }
                            checked={closeToTray}
                            onCheckedChange={(checked) => {
                                setCloseToTrayState(checked)
                                void setCloseToTray(checked)
                            }}
                        />
                    </SettingsGroup>
                </Section>
            ) : null}

            <Section
                title="性能模式"
                description="牺牲视觉效果换更低的内存与 GPU 占用"
            >
                <div className="space-y-3">
                    <SettingsGroup>
                        <SwitchRow
                            title="性能模式"
                            description="一键关闭毛玻璃与动画，禁用 GPU 相关进程"
                            checked={performanceMode}
                            onCheckedChange={(checked) =>
                                void handleTogglePerformance(checked)
                            }
                        />
                    </SettingsGroup>
                    <SettingsGroup>
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
                    </SettingsGroup>
                    <SettingsGroup>
                        <SwitchRow
                            title="常驻毛玻璃"
                            description="与外观设置联动；性能模式下强制关闭"
                            checked={appearance.materialGlass}
                            disabled={performanceMode}
                            onCheckedChange={setMaterialGlass}
                        />
                    </SettingsGroup>
                </div>
            </Section>

            {!isWebMode() ? (
                <Section
                    title="开发者工具"
                    description="调试界面布局与网络请求"
                >
                    <SettingsGroup>
                        <SwitchRow
                            title="启用 DevTools"
                            description="默认 F12 打开开发者工具"
                            checked={devtoolsEnabled}
                            onCheckedChange={(checked) => {
                                setDevToolsEnabled(checked)
                                setDevtoolsEnabledState(checked)
                                if (checked && import.meta.env.DEV) {
                                    void invoke("open_devtools")
                                }
                            }}
                        />
                    </SettingsGroup>
                </Section>
            ) : null}

            <Section title="缓存" description="API 响应与本地封面缓存">
                <div className="space-y-3">
                    <SettingsGroup>
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
                                className="h-8 shrink-0 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
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
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-fill)] px-3 py-2.5">
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
                            <div className="space-y-1 rounded-xl bg-[var(--surface-fill)] px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                <p
                                    className="truncate"
                                    title={storagePaths.appDir}
                                >
                                    {nativeMacOS ? "应用数据" : "运行目录"} ·{" "}
                                    {storagePaths.appDir}
                                </p>
                                <p
                                    className="truncate"
                                    title={storagePaths.databasePath}
                                >
                                    数据库 · {storagePaths.databasePath}
                                </p>
                                <p
                                    className="truncate"
                                    title={storagePaths.cacheDir}
                                >
                                    缓存 · {storagePaths.cacheDir}
                                </p>
                            </div>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">
                                浏览器预览无本地路径；桌面端由 Tauri 解析 exe 目录
                            </p>
                        )}
                    </SettingsGroup>

                    <SettingsGroup>
                        <div className="flex items-center justify-between gap-4">
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
                                className="h-8 shrink-0 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)]"
                            >
                                清空
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {LIMIT_PRESETS.map((preset) => (
                                <ChoiceChip
                                    key={preset.id}
                                    label={preset.label}
                                    active={coverCacheLimit === preset.bytes}
                                    onClick={() =>
                                        handleCoverCacheLimit(preset.bytes)
                                    }
                                />
                            ))}
                        </div>
                    </SettingsGroup>
                </div>
            </Section>
        </div>
    )
}

export { OtherTab }
