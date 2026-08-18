import { useEffect, useState } from "react"

import { Section } from "@/components/music/section"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { notifyInfo, notifySuccess, notifyError } from "@/lib/notify"
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
import { probeNativeApi } from "@/lib/netease/integrated-api"
import {
    QUALITY_OPTIONS,
    getNeteaseQualityBr,
    setNeteaseQualityBr,
    type QualityBr,
} from "@/lib/netease/quality"
import { ChoiceChip, SettingsGroup } from "@/pages/settings/settings-ui"
import { isWebMode } from "@/lib/web-mode"

function SourceTab() {
    const [settings, setSettings] = useState(() => getApiSettings())
    const [customDraft, setCustomDraft] = useState(
        () => getApiSettings().customUrl || DEFAULT_BASE_URL,
    )
    const [savedHint, setSavedHint] = useState<string | null>(null)
    const [nativeHint, setNativeHint] = useState<string | null>(null)
    const [speedHint, setSpeedHint] = useState<string | null>(null)
    const [speedLoading, setSpeedLoading] = useState(false)
    const [qualityBr, setQualityBr] = useState<QualityBr>(() =>
        getNeteaseQualityBr(),
    )

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
        const title =
            mode === "integrated" ? "已切换内置 API" : "已切换对接 API"
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
                EXTERNAL_SOURCES.find((item) => item.id === source)?.label ??
                source,
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
        <Section
            title="音源"
            description={
                isWebMode()
                    ? "对接外部 NCM 源 · 音质"
                    : "内置 API 或对接外部 NCM 源 · 音质"
            }
        >
            <div className="space-y-3">
                {!isWebMode() ? (
                    <SettingsGroup>
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

                        {settings.mode === "external" ? (
                            <div className="space-y-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
                                <div>
                                    <p className="text-[13px] font-medium">
                                        外部 API 源
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                                        官方 / 社区预设，或自定义 Base URL
                                    </p>
                                </div>
                                <Select
                                    value={settings.source}
                                    onValueChange={(value) =>
                                        handleSource(
                                            value as ExternalSourceId | null,
                                        )
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
                                                        event.currentTarget
                                                            .value,
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
                    </SettingsGroup>
                ) : (
                    <SettingsGroup>
                        <div>
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                外部 API 源
                            </p>
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
                    </SettingsGroup>
                )}

                <SettingsGroup>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={speedLoading}
                            onClick={() => void handleSpeedTest()}
                            className="h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:opacity-50"
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
                </SettingsGroup>

                <SettingsGroup
                    title="网易云音质"
                    description="不可用时自动降级"
                >
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
                </SettingsGroup>
            </div>
        </Section>
    )
}

export { SourceTab }
