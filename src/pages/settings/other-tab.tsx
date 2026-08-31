import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Check } from "lucide-react"

import { useTheme } from "@/components/app/theme-provider"
import {
    CLOSE_ASK_EVENT,
    CLOSE_TO_TRAY_EVENT,
    getCloseAsk,
    getCloseToTray,
    setCloseAsk,
    setCloseToTray,
} from "@/lib/app/close-to-tray-prefs"
import {
    DEVTOOLS_EVENT,
    applyDevtoolsEnabled,
    getDevToolsEnabled,
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
import {
    collectCoverKeepHashes,
    pruneCoverOverrides,
} from "@/lib/music/cover-overrides"
import { reextractLocalCovers } from "@/lib/local/import-folder"
import { pruneRemoteCoverIndex } from "@/lib/music/remote-cover-cache"
import { getStoragePaths } from "@/lib/storage/paths"
import { notifyError, notifySuccess } from "@/lib/notify"
import { isMacOS, isNativeMacOS } from "@/lib/platform"
import {
    ActionButton,
    ChoiceChip,
    ChipRow,
    SettingsGroup,
    SwitchRow,
    TabHeader,
} from "@/pages/settings/settings-ui"
import { isWebMode } from "@/lib/web-mode"

function OtherTab() {
    const { appearance, setMaterialGlass } = useTheme()
    const nativeMacOS = isNativeMacOS()
    // 清理不可逆：首次点击进入确认态，3 秒内再点才执行，避免误触
    const [confirmClear, setConfirmClear] = useState<"api" | "cover" | null>(
        null,
    )
    const [devtoolsEnabled, setDevtoolsEnabledState] = useState(() =>
        getDevToolsEnabled(),
    )
    const [performanceMode, setPerformanceModeState] = useState(() =>
        getPerformanceMode(),
    )
    const [closeToTray, setCloseToTrayState] = useState(() => getCloseToTray())
    const [closeAsk, setCloseAskState] = useState(() => getCloseAsk())
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
        function onCloseAsk() {
            setCloseAskState(getCloseAsk())
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
        window.addEventListener(CLOSE_ASK_EVENT, onCloseAsk)
        window.addEventListener(TTL_EVENT, onTtl)
        window.addEventListener(AUTO_PURGE_EVENT, onAutoPurge)
        window.addEventListener(PERFORMANCE_MODE_EVENT, onPerformance)
        return () => {
            window.removeEventListener(DEVTOOLS_EVENT, onDevtools)
            window.removeEventListener(CLOSE_TO_TRAY_EVENT, onCloseToTray)
            window.removeEventListener(CLOSE_ASK_EVENT, onCloseAsk)
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

    function requestClearCache(key: "api" | "cover") {
        if (confirmClear === key) {
            setConfirmClear(null)
            if (key === "api") {
                void handleClearApiCache()
            } else {
                void handleClearCoverCache()
            }
            return
        }
        setConfirmClear(key)
        window.setTimeout(
            () => setConfirmClear((cur) => (cur === key ? null : cur)),
            3000,
        )
    }

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
            // 保留仍在引用的封面：本地库专辑/艺人/曲目内嵌封面 + 歌曲封面覆盖
            const keep = collectCoverKeepHashes()
            await invoke("clear_cover_cache", { keepHashes: keep })
            // 清理直接删文件，索引不随行失效：立即对账剪枝，
            // 被清掉的封面回退远程 URL 并重新缓存，不再引用失效路径
            void pruneRemoteCoverIndex().catch(() => {})
            void pruneCoverOverrides().catch(() => {})
            // 本地音乐封面若仍引用被删文件，重新解析音频文件提取（幂等写盘）
            void reextractLocalCovers({ force: true }).catch(() => {})
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
        // 立即按新阈值清理一次，引用中的封面不回收；
        // 清理完成后对账索引，失效条目回源重下而不是挂死链
        void invoke("purge_cover_cache_cmd", {
            maxBytes: bytes,
            keepHashes: collectCoverKeepHashes(),
        })
            .then(() => {
                void pruneRemoteCoverIndex().catch(() => {})
                void pruneCoverOverrides().catch(() => {})
            })
            .catch(() => {})
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
        <div className="space-y-3">
            <TabHeader title="其他" description="窗口行为、性能、缓存与开发者选项" />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {!isWebMode() ? (
                    <SettingsGroup title="窗口与托盘" description="关闭窗口时的行为">
                        <SwitchRow
                            title="关闭前询问"
                            description={
                                isMacOS()
                                    ? "点击关闭按钮时先确认保留到菜单栏还是退出"
                                    : "点击关闭按钮时先确认最小化到托盘还是退出"
                            }
                            checked={closeAsk}
                            onCheckedChange={(checked) => {
                                setCloseAskState(checked)
                                void setCloseAsk(checked)
                            }}
                        />
                        <SwitchRow
                            title={
                                isMacOS()
                                    ? "关闭窗口后保留在菜单栏"
                                    : "关闭窗口时最小化到托盘"
                            }
                            description={
                                isMacOS()
                                    ? "关闭后音乐继续播放；点 Dock 或菜单栏图标恢复"
                                    : "关闭后音乐继续播放，从系统托盘可恢复"
                            }
                            checked={closeToTray}
                            onCheckedChange={(checked) => {
                                setCloseToTrayState(checked)
                                void setCloseToTray(checked)
                            }}
                        />
                    </SettingsGroup>
                ) : null}

                <SettingsGroup
                    title="性能模式"
                    description="牺牲视觉效果换更低的内存与 GPU 占用"
                >
                    <SwitchRow
                        title="性能模式"
                        description="一键关闭毛玻璃与动画，禁用 GPU 相关进程"
                        checked={performanceMode}
                        onCheckedChange={(checked) =>
                            void handleTogglePerformance(checked)
                        }
                    />
                    <div className="space-y-2">
                        {perfItems.map((item) => (
                            <div
                                key={item.label}
                                className="flex items-start gap-2"
                            >
                                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">
                                        {item.label}
                                    </p>
                                    <p className="text-[13px] text-muted-foreground">
                                        {item.note}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </SettingsGroup>

                <SettingsGroup
                    className="lg:col-span-2"
                    title="缓存管理"
                    description="API 响应与封面缓存，超出上限自动清理"
                >
                    <div className="space-y-2">
                        <p className="text-[15px] font-medium">API 响应缓存</p>
                        <ChipRow>
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
                        </ChipRow>
                        <SwitchRow
                            title="自动清理过期缓存"
                            description={`超过上方时长后删除过期项，默认保留 ${Math.round(DEFAULT_TTL_MS / 60_000)} 分钟`}
                            checked={autoPurge}
                            disabled={cacheTtl <= 0}
                            onCheckedChange={(checked) => {
                                setApiCacheAutoPurge(checked)
                                setAutoPurge(checked)
                            }}
                        />
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                            <ActionButton
                                variant={
                                    confirmClear === "api"
                                        ? "danger"
                                        : "default"
                                }
                                onClick={() => requestClearCache("api")}
                            >
                                {confirmClear === "api"
                                    ? "确认清空？"
                                    : "清空缓存"}
                            </ActionButton>
                            {cacheHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {cacheHint}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[15px] font-medium">封面缓存</p>
                        <ChipRow>
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
                        </ChipRow>
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                            <ActionButton
                                variant={
                                    confirmClear === "cover"
                                        ? "danger"
                                        : "default"
                                }
                                onClick={() => requestClearCache("cover")}
                            >
                                {confirmClear === "cover"
                                    ? "确认清空？"
                                    : "清空缓存"}
                            </ActionButton>
                        </div>
                    </div>
                    {storagePaths ? (
                        <div className="space-y-1 rounded-xl bg-[var(--surface-fill)] px-3 py-2 font-mono text-[13px] leading-relaxed text-muted-foreground">
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
                        <p className="text-[13px] text-muted-foreground">
                            浏览器预览无本地路径；桌面端由 Tauri 解析 exe 目录
                        </p>
                    )}
                </SettingsGroup>

                {/* DevTools 随 release 附带，非网页模式均可手动开关 */}
                {!isWebMode() ? (
                    <SettingsGroup
                        className="lg:col-span-2"
                        title="开发者工具"
                        description="调试界面布局与网络请求"
                    >
                        <SwitchRow
                            title="启用 DevTools"
                            description="随 release 附带，开启后立即打开面板，可按 F12 开合"
                            checked={devtoolsEnabled}
                            onCheckedChange={(checked) => {
                                applyDevtoolsEnabled(checked)
                                setDevtoolsEnabledState(checked)
                            }}
                        />
                    </SettingsGroup>
                ) : null}
            </div>
        </div>
    )
}

export { OtherTab }
