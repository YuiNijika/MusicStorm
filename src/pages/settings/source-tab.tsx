import { useEffect, useState } from "react"

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
import {
    ActionButton,
    ChoiceChip,
    ChipRow,
    SettingsGroup,
    TabHeader,
} from "@/pages/settings/settings-ui"
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
        const url = customDraft.trim() || DEFAULT_BASE_URL
        // 未变化时不重复落盘/弹提示，供失焦与回车的自动保存复用
        if (url === settings.customUrl) {
            return
        }
        const next = setExternalSource("custom", url)
        setSettings(next)
        const effective = resolveEffectiveBaseUrl(next)
        setCustomDraft(effective)
        flash("已保存自定义源")
        notifySuccess("已保存自定义源", { description: effective })
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
    const webMode = isWebMode()

    return (
        <div className="space-y-3">
            <TabHeader
                title="音源"
                description={
                    webMode
                        ? "对接外部 NCM 源与音质偏好"
                        : "内置 API 或对接外部 NCM 源与音质偏好"
                }
            />

            <div className="space-y-3">
                {!webMode ? (
                    <SettingsGroup title="API 模式" description="默认使用应用内置">
                        <ChipRow>
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
                        </ChipRow>
                        {settings.mode === "integrated" ? (
                            <p className="text-[13px] text-muted-foreground">
                                {nativeHint ??
                                    "内置运行时：加密在应用内完成，桌面代理发请求"}
                            </p>
                        ) : null}
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                            <ActionButton
                                disabled={speedLoading}
                                onClick={() => void handleSpeedTest()}
                            >
                                {speedLoading
                                    ? "检测中"
                                    : settings.mode === "integrated"
                                      ? "检测内置"
                                      : "测速"}
                            </ActionButton>
                            {speedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {speedHint}
                                </span>
                            ) : null}
                            {savedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {savedHint}
                                </span>
                            ) : null}
                        </div>
                    </SettingsGroup>
                ) : null}

                <SettingsGroup
                    title={webMode ? "外部 API 源" : "外部源"}
                    description={
                        webMode
                            ? "官方 / 社区预设，或自定义 Base URL"
                            : "切换到对接 API 后在此选择"
                    }
                >
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
                                <SelectItem key={preset.id} value={preset.id}>
                                    {preset.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {settings.source === "custom" ? (
                        <div className="space-y-2">
                            <p className="text-[13px] font-medium text-muted-foreground">
                                自定义 URL
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    value={customDraft}
                                    onChange={(event) =>
                                        setCustomDraft(event.currentTarget.value)
                                    }
                                    onBlur={handleSaveCustom}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.currentTarget.blur()
                                        }
                                    }}
                                    placeholder={DEFAULT_BASE_URL}
                                    className="material-field h-9 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none"
                                />
                                <ActionButton
                                    variant="primary"
                                    className="shrink-0"
                                    onClick={handleSaveCustom}
                                >
                                    保存
                                </ActionButton>
                            </div>
                            <p className="truncate text-[13px] text-muted-foreground">
                                {settings.customUrl
                                    ? `已保存：${settings.customUrl}`
                                    : "尚未保存，输入后回车或点保存"}
                            </p>
                        </div>
                    ) : (
                        <p className="truncate text-[13px] text-muted-foreground">
                            {getNeteaseBaseUrl()}
                        </p>
                    )}
                    {webMode ? (
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                            <ActionButton
                                disabled={speedLoading}
                                onClick={() => void handleSpeedTest()}
                            >
                                {speedLoading ? "检测中" : "测速"}
                            </ActionButton>
                            {speedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {speedHint}
                                </span>
                            ) : null}
                            {savedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {savedHint}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </SettingsGroup>

                <SettingsGroup
                    title="网易云音质"
                    description="不可用时自动降级"
                >
                    <ChipRow>
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
                    </ChipRow>
                </SettingsGroup>
            </div>
        </div>
    )
}

export { SourceTab }
